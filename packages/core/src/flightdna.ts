import { EventBus } from "./events";
import type {
  FlightDNAConfig,
  FlightDNAEvent,
  FlightDNAEventMap,
  FlightState,
} from "./types";

type Listener<T> = (data: T) => void;

/**
 * FlightDNA — main entry point for the aircraft digital twin pipeline.
 *
 * Orchestrates data ingestion from ADS-B sources, weather enrichment,
 * flight dynamics modeling, and digital twin state estimation.
 */
export class FlightDNA {
  private readonly config: Required<
    Pick<FlightDNAConfig, "updateInterval" | "dynamics" | "twinEnabled">
  > &
    FlightDNAConfig;
  private readonly bus = new EventBus();
  private readonly tracked = new Map<string, FlightState>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config: FlightDNAConfig = {}) {
    this.config = {
      updateInterval: config.updateInterval ?? 10_000,
      dynamics: config.dynamics ?? true,
      twinEnabled: config.twinEnabled ?? true,
      ...config,
    };
  }

  /**
   * Subscribe to a FlightDNA event.
   */
  on<E extends FlightDNAEvent>(
    event: E,
    listener: Listener<FlightDNAEventMap[E]>,
  ): () => void {
    return this.bus.on(event, listener);
  }

  /**
   * Start tracking an aircraft by ICAO24 address.
   */
  async track(icao24: string): Promise<void> {
    const normalized = icao24.toLowerCase().trim();
    if (this.tracked.has(normalized)) {
      return;
    }

    this.bus.emit("trackStart", {
      icao24: normalized,
      timestamp: Date.now(),
    });

    // Initialize with an empty state placeholder
    this.tracked.set(normalized, {
      aircraft: { icao24: normalized },
      timestamp: Date.now(),
      position: { latitude: 0, longitude: 0, altitude: 0 },
      velocity: { groundSpeed: 0, track: 0, verticalRate: 0 },
      onGround: false,
      source: "pending",
    });
  }

  /**
   * Stop tracking an aircraft.
   */
  untrack(icao24: string): void {
    const normalized = icao24.toLowerCase().trim();
    if (this.tracked.delete(normalized)) {
      this.bus.emit("trackEnd", {
        icao24: normalized,
        timestamp: Date.now(),
        reason: "manual",
      });
    }
  }

  /**
   * Ingest a flight state update from an external source.
   */
  ingest(state: FlightState): void {
    const icao24 = state.aircraft.icao24.toLowerCase();
    this.tracked.set(icao24, state);
    this.bus.emit("stateUpdate", state);
  }

  /**
   * Get the current state of a tracked aircraft.
   */
  getState(icao24: string): FlightState | undefined {
    return this.tracked.get(icao24.toLowerCase().trim());
  }

  /**
   * Get all currently tracked aircraft states.
   */
  getAllStates(): FlightState[] {
    return Array.from(this.tracked.values());
  }

  /**
   * Get the list of tracked ICAO24 addresses.
   */
  getTrackedAircraft(): string[] {
    return Array.from(this.tracked.keys());
  }

  /**
   * Start the periodic update loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(() => {
      this.tick();
    }, this.config.updateInterval);
  }

  /**
   * Stop the periodic update loop.
   */
  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Whether the pipeline is currently running.
   */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Number of aircraft currently being tracked.
   */
  get trackedCount(): number {
    return this.tracked.size;
  }

  /**
   * Destroy the instance and clean up all resources.
   */
  destroy(): void {
    this.stop();
    this.tracked.clear();
    this.bus.off();
  }

  /**
   * Internal tick — called on each update interval.
   * In a full implementation, this would poll data sources
   * and update all tracked aircraft.
   */
  private tick(): void {
    // Placeholder for the update cycle:
    // 1. Poll ADS-B data for all tracked aircraft
    // 2. Enrich with weather data
    // 3. Run dynamics model
    // 4. Update digital twin states
    // 5. Emit stateUpdate events
  }
}
