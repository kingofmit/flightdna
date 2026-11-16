import type { FlightState } from "@flightdna/core";

const safeReplacer = (_key: string, value: unknown) => {
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
};

export class JSONLExporter {
  private readonly timestampFormat: "iso" | "unix" | "unix_ms";

  constructor(options: { timestampFormat?: "iso" | "unix" | "unix_ms" } = {}) {
    this.timestampFormat = options.timestampFormat ?? "iso";
  }

  /**
   * Export states as JSON Lines (one JSON object per line).
   */
  export(states: FlightState[]): string {
    return states.map(s => this.formatLine(s)).join("\n");
  }

  /**
   * Generator for streaming JSONL output.
   */
  *exportStream(states: Iterable<FlightState>): Generator<string, void, unknown> {
    for (const state of states) {
      yield this.formatLine(state);
    }
  }

  /**
   * Format a single state as a JSON line.
   */
  formatLine(state: FlightState): string {
    const record: Record<string, unknown> = {
      timestamp: this.formatTimestamp(state.timestamp),
      icao24: state.aircraft.icao24,
      callsign: state.aircraft.callsign ?? null,
      latitude: state.position.latitude,
      longitude: state.position.longitude,
      altitude: state.position.altitude,
      groundSpeed: state.velocity.groundSpeed,
      track: state.velocity.track,
      verticalRate: state.velocity.verticalRate,
      onGround: state.onGround,
      source: state.source,
    };
    return JSON.stringify(record, safeReplacer);
  }

  private formatTimestamp(ts: number): string | number {
    switch (this.timestampFormat) {
      case "unix": return Math.floor(ts / 1000);
      case "unix_ms": return ts;
      default: return new Date(ts).toISOString();
    }
  }
}
