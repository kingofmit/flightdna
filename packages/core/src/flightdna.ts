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
  private tickCount = 0;
  private readonly statsInterval = 10; // Emit stats every N ticks

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
   * Ingest multiple flight states at once (for batch/historical analysis).
   * Processes them in timestamp order.
   */
  ingestBatch(states: FlightState[]): void {
    const sorted = [...states].sort((a, b) => a.timestamp - b.timestamp);
    for (const state of sorted) {
      this.ingest(state);
    }
  }

  /**
   * Start the periodic update loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(() => {
      void this.tick();
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
   * Orchestrates the pipeline: fetch -> enrich -> twin update -> emit.
   */
  private async tick(): Promise<void> {
    this.tickCount++;

    try {
      const tracked = this.getTrackedAircraft();

      // 1. Fetch latest states
      let states: FlightState[] = [];
      if (this.config.pipeline?.fetch) {
        states = await this.config.pipeline.fetch(tracked);
      }

      // 2. Process each state
      for (const state of states) {
        const icao24 = state.aircraft.icao24.toLowerCase();

        // Auto-track new aircraft
        if (this.config.autoTrack && !this.tracked.has(icao24)) {
          if (this.tracked.size < (this.config.maxTracked ?? 5000)) {
            await this.track(icao24);
          }
        }

        if (!this.tracked.has(icao24)) continue;

        // 3. Enrich with weather/performance data
        let enriched = state;
        if (this.config.pipeline?.enrich) {
          try {
            enriched = this.config.pipeline.enrich(state);
          } catch {
            // Enrichment failure is non-fatal; proceed with unenriched state
          }
        }

        // 4. Update twin
        if (this.config.pipeline?.updateTwin) {
          try {
            this.config.pipeline.updateTwin(icao24, enriched);
          } catch {
            // Twin update failure is non-fatal
          }
        }

        // 5. Store and emit
        this.tracked.set(icao24, enriched);
        this.bus.emit("stateUpdate", enriched);
      }

      // 6. Evict inactive aircraft
      this.evictInactive();
    } catch (err) {
      this.bus.emit("error", {
        message: err instanceof Error ? err.message : String(err),
        code: "TICK_ERROR",
      });
    }

    // Emit periodic stats regardless of whether the tick body succeeded
    if (this.tickCount % this.statsInterval === 0) {
      this.bus.emit("stats", {
        tickCount: this.tickCount,
        trackedCount: this.tracked.size,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Evict aircraft that have not received updates within the inactivity timeout.
   */
  private evictInactive(): void {
    const timeout = this.config.inactivityTimeout ?? 300_000;
    const cutoff = Date.now() - timeout;

    for (const [icao24, state] of this.tracked) {
      if (state.source === "pending") continue; // Don't evict pending tracks
      if (state.timestamp < cutoff) {
        this.tracked.delete(icao24);
        this.bus.emit("trackEnd", {
          icao24,
          timestamp: Date.now(),
          reason: "timeout",
        });
      }
    }
  }
}
