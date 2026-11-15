import type { FlightState } from "@flightdna/core";
import type { ExportConfig } from "./types";

const DEFAULT_FIELDS = [
  "timestamp",
  "icao24",
  "callsign",
  "latitude",
  "longitude",
  "altitude",
  "groundSpeed",
  "track",
  "verticalRate",
  "onGround",
  "squawk",
];

/**
 * Export flight states to CSV format.
 */
export class CSVExporter {
  private readonly config: ExportConfig;

  constructor(config: Partial<ExportConfig> = {}) {
    this.config = {
      format: "csv",
      headers: config.headers ?? true,
      delimiter: config.delimiter ?? ",",
      fields: config.fields ?? DEFAULT_FIELDS,
      timestampFormat: config.timestampFormat ?? "iso",
    };
  }

  /**
   * Export an array of flight states to a CSV string.
   */
  export(states: FlightState[]): string {
    const lines: string[] = [];
    const fields = this.config.fields ?? DEFAULT_FIELDS;
    const delim = this.config.delimiter ?? ",";

    if (this.config.headers) {
      lines.push(fields.join(delim));
    }

    for (const state of states) {
      const values = fields.map((field) =>
        this.extractField(state, field),
      );
      lines.push(values.join(delim));
    }

    return lines.join("\n");
  }

  /**
   * Export to a format suitable for streaming (returns an iterator of lines).
   */
  *exportStream(
    states: Iterable<FlightState>,
  ): Generator<string, void, unknown> {
    const fields = this.config.fields ?? DEFAULT_FIELDS;
    const delim = this.config.delimiter ?? ",";

    if (this.config.headers) {
      yield fields.join(delim);
    }

    for (const state of states) {
      const values = fields.map((field) =>
        this.extractField(state, field),
      );
      yield values.join(delim);
    }
  }

  /**
   * Extract a field value from a FlightState.
   */
  private extractField(state: FlightState, field: string): string {
    switch (field) {
      case "timestamp":
        return this.formatTimestamp(state.timestamp);
      case "icao24":
        return state.aircraft.icao24;
      case "callsign":
        return state.aircraft.callsign ?? "";
      case "latitude":
        return String(state.position.latitude);
      case "longitude":
        return String(state.position.longitude);
      case "altitude":
        return String(state.position.altitude);
      case "geometricAltitude":
        return String(state.position.geometricAltitude ?? "");
      case "groundSpeed":
        return String(state.velocity.groundSpeed);
      case "trueAirspeed":
        return String(state.velocity.trueAirspeed ?? "");
      case "track":
        return String(state.velocity.track);
      case "verticalRate":
        return String(state.velocity.verticalRate);
      case "heading":
        return String(state.velocity.heading ?? "");
      case "onGround":
        return state.onGround ? "1" : "0";
      case "squawk":
        return state.squawk ?? "";
      case "source":
        return state.source;
      default:
        return "";
    }
  }

  private formatTimestamp(ts: number): string {
    switch (this.config.timestampFormat) {
      case "unix":
        return String(Math.floor(ts / 1000));
      case "unix_ms":
        return String(ts);
      case "iso":
      default:
        return new Date(ts).toISOString();
    }
  }
}
