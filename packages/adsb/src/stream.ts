import type { FlightState } from "@flightdna/core";
import { OpenSkyClient } from "./opensky";
import type { OpenSkyConfig, OpenSkyQueryParams } from "./types";

type StreamListener = (states: FlightState[]) => void;
type ErrorListener = (error: Error) => void;

/** Connection states for the stream. */
type ConnectionState = "disconnected" | "connecting" | "connected" | "circuit_open";

/** Default number of consecutive failures before the circuit breaker opens. */
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 10;

/** Default cooldown in ms before retrying after the circuit breaker opens. */
const DEFAULT_CIRCUIT_BREAKER_COOLDOWN = 60_000;

/**
 * Streaming adapter that periodically polls the OpenSky Network
 * and emits decoded aircraft states.
 */
export class ADSBStream {
  private readonly client: OpenSkyClient;
  private readonly pollInterval: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: StreamListener[] = [];
  private errorListeners: ErrorListener[] = [];
  private query: OpenSkyQueryParams = {};
  private running = false;

  /** Current connection state. */
  private _connectionState: ConnectionState = "disconnected";

  /** Number of consecutive poll failures. */
  private consecutiveFailures = 0;

  /** Threshold before the circuit breaker trips. */
  private readonly circuitBreakerThreshold: number;

  /** Cooldown in ms before resuming after the circuit breaker trips. */
  private readonly circuitBreakerCooldown: number;

  /** Timer for circuit breaker recovery. */
  private circuitRecoveryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    config: OpenSkyConfig & {
      pollInterval?: number;
      circuitBreakerThreshold?: number;
      circuitBreakerCooldown?: number;
    } = {},
  ) {
    const { pollInterval, circuitBreakerThreshold, circuitBreakerCooldown, ...clientConfig } = config;
    this.client = new OpenSkyClient(clientConfig);
    // OpenSky anonymous rate limit is ~10s; default to 15s
    this.pollInterval = pollInterval ?? 15_000;
    this.circuitBreakerThreshold = circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD;
    this.circuitBreakerCooldown = circuitBreakerCooldown ?? DEFAULT_CIRCUIT_BREAKER_COOLDOWN;
  }

  /**
   * Set the query parameters for the stream.
   */
  setQuery(params: OpenSkyQueryParams): void {
    this.query = params;
  }

  /**
   * Subscribe to state updates.
   */
  onStates(listener: StreamListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Subscribe to error events.
   */
  onError(listener: ErrorListener): () => void {
    this.errorListeners.push(listener);
    return () => {
      this.errorListeners = this.errorListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Start polling for ADS-B data.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this._connectionState = "connecting";
    this.consecutiveFailures = 0;

    // Fetch immediately, then on interval
    void this.poll();
    this.intervalId = setInterval(() => {
      void this.poll();
    }, this.pollInterval);
  }

  /**
   * Stop polling.
   */
  stop(): void {
    this.running = false;
    this._connectionState = "disconnected";
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.circuitRecoveryTimer) {
      clearTimeout(this.circuitRecoveryTimer);
      this.circuitRecoveryTimer = null;
    }
  }

  /**
   * Whether the stream is currently active.
   */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Current connection state.
   */
  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  /**
   * Poll the OpenSky API once and emit results.
   */
  private async poll(): Promise<void> {
    // Skip polling when the circuit breaker is open
    if (this._connectionState === "circuit_open") {
      return;
    }

    try {
      this._connectionState = "connecting";
      const states = await this.client.getStates(this.query);
      this._connectionState = "connected";
      this.consecutiveFailures = 0;

      for (const listener of this.listeners) {
        listener(states);
      }
    } catch (error) {
      this.consecutiveFailures++;

      const err = error instanceof Error ? error : new Error(String(error));

      // Emit error to listeners
      for (const listener of this.errorListeners) {
        listener(err);
      }

      // Trip the circuit breaker after too many consecutive failures
      if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
        this._connectionState = "circuit_open";

        this.circuitRecoveryTimer = setTimeout(() => {
          this.circuitRecoveryTimer = null;
          if (this.running) {
            this._connectionState = "connecting";
            this.consecutiveFailures = 0;
          }
        }, this.circuitBreakerCooldown);
      }
    }
  }
}
