import type { FlightState } from "@flightdna/core";
import type { ExportConfig } from "./types";

/**
 * Export flight states to JSON format.
 */
export class JSONExporter {
  private readonly prettyPrint: boolean;
  private readonly timestampFormat: "iso" | "unix" | "unix_ms";

  constructor(config: Partial<ExportConfig> = {}) {
    this.prettyPrint = config.prettyPrint ?? false;
    this.timestampFormat = config.timestampFormat ?? "iso";
  }

  /**
   * Export flight states to a JSON string.
   */
  export(states: FlightState[]): string {
    const data = states.map((state) => this.stateToRecord(state));
    return JSON.stringify(data, null, this.prettyPrint ? 2 : undefined);
  }

  /**
   * Export flight states as a GeoJSON FeatureCollection.
   * Useful for mapping and visualization.
   */
  exportGeoJSON(states: FlightState[]): string {
    const features = states.map((state) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [
          state.position.longitude,
          state.position.latitude,
          state.position.altitude,
        ],
      },
      properties: {
        icao24: state.aircraft.icao24,
        callsign: state.aircraft.callsign ?? null,
        timestamp: this.formatTimestamp(state.timestamp),
        groundSpeed: state.velocity.groundSpeed,
        track: state.velocity.track,
        verticalRate: state.velocity.verticalRate,
        onGround: state.onGround,
      },
    }));

    const collection = {
      type: "FeatureCollection" as const,
      features,
    };

    return JSON.stringify(collection, null, this.prettyPrint ? 2 : undefined);
  }

  /**
   * Export the trajectory as a GeoJSON LineString.
   */
  exportTrajectory(states: FlightState[]): string {
    if (states.length === 0) {
      return JSON.stringify({ type: "FeatureCollection", features: [] });
    }

    const coordinates = states.map((s) => [
      s.position.longitude,
      s.position.latitude,
      s.position.altitude,
    ]);

    const feature = {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates,
      },
      properties: {
        icao24: states[0].aircraft.icao24,
        callsign: states[0].aircraft.callsign ?? null,
        startTime: this.formatTimestamp(states[0].timestamp),
        endTime: this.formatTimestamp(states[states.length - 1].timestamp),
        points: states.length,
      },
    };

    return JSON.stringify(
      { type: "FeatureCollection", features: [feature] },
      null,
      this.prettyPrint ? 2 : undefined,
    );
  }

  private stateToRecord(state: FlightState): Record<string, unknown> {
    return {
      timestamp: this.formatTimestamp(state.timestamp),
      icao24: state.aircraft.icao24,
      callsign: state.aircraft.callsign ?? null,
      latitude: state.position.latitude,
      longitude: state.position.longitude,
      altitude: state.position.altitude,
      geometricAltitude: state.position.geometricAltitude ?? null,
      groundSpeed: state.velocity.groundSpeed,
      trueAirspeed: state.velocity.trueAirspeed ?? null,
      track: state.velocity.track,
      verticalRate: state.velocity.verticalRate,
      heading: state.velocity.heading ?? null,
      onGround: state.onGround,
      squawk: state.squawk ?? null,
      source: state.source,
    };
  }

  private formatTimestamp(ts: number): string | number {
    switch (this.timestampFormat) {
      case "unix":
        return Math.floor(ts / 1000);
      case "unix_ms":
        return ts;
      case "iso":
      default:
        return new Date(ts).toISOString();
    }
  }
}
