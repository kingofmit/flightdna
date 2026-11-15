import type { FlightState } from "@flightdna/core";
import { OpenSkyClient } from "./opensky";
import type { OpenSkyConfig, OpenSkyQueryParams } from "./types";

type StreamListener = (states: FlightState[]) => void;

/**
 * Streaming adapter that periodically polls the OpenSky Network
 * and emits decoded aircraft states.
 */
export class ADSBStream {
  private readonly client: OpenSkyClient;
  private readonly pollInterval: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: StreamListener[] = [];
  private query: OpenSkyQueryParams = {};
  private running = false;

  constructor(config: OpenSkyConfig & { pollInterval?: number } = {}) {
    const { pollInterval, ...clientConfig } = config;
    this.client = new OpenSkyClient(clientConfig);
    // OpenSky anonymous rate limit is ~10s; default to 15s
    this.pollInterval = pollInterval ?? 15_000;
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
   * Start polling for ADS-B data.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

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
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Whether the stream is currently active.
   */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Poll the OpenSky API once and emit results.
   */
  private async poll(): Promise<void> {
    try {
      const states = await this.client.getStates(this.query);
      for (const listener of this.listeners) {
        listener(states);
      }
    } catch (error) {
      // Silently skip failed polls — transient network errors are common
      console.warn("[ADSBStream] Poll failed:", error);
    }
  }
}
