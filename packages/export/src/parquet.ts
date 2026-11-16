import type { FlightState } from "@flightdna/core";

/**
 * Columnar data format for efficient analytics.
 * Each field is stored as a typed array for memory efficiency
 * and compatibility with columnar storage formats (Parquet, Arrow).
 */
export interface ColumnarFlightData {
  /** Number of rows */
  length: number;
  /** Column arrays */
  columns: {
    timestamp: Float64Array;
    icao24: string[];
    callsign: (string | null)[];
    latitude: Float64Array;
    longitude: Float64Array;
    altitude: Float64Array;
    groundSpeed: Float64Array;
    track: Float64Array;
    verticalRate: Float64Array;
    onGround: Uint8Array;
  };
  /** Schema metadata */
  schema: Array<{
    name: string;
    type: "float64" | "string" | "string_nullable" | "uint8";
  }>;
}

/**
 * Columnar exporter for flight state data.
 *
 * Converts FlightState arrays into a columnar layout suitable for
 * analytics pipelines and columnar storage formats (Parquet, Arrow).
 *
 * For full Parquet file output, pipe NDJSON through an external tool:
 * ```bash
 * duckdb -c "COPY (SELECT * FROM read_json_auto('data.ndjson')) TO 'data.parquet'"
 * ```
 */
export class ColumnarExporter {
  /**
   * Convert FlightState array to columnar format.
   * This is memory-efficient for large datasets and can be
   * directly used with Apache Arrow or converted to Parquet.
   */
  toColumnar(states: FlightState[]): ColumnarFlightData {
    const n = states.length;

    const timestamp = new Float64Array(n);
    const icao24: string[] = new Array(n);
    const callsign: (string | null)[] = new Array(n);
    const latitude = new Float64Array(n);
    const longitude = new Float64Array(n);
    const altitude = new Float64Array(n);
    const groundSpeed = new Float64Array(n);
    const track = new Float64Array(n);
    const verticalRate = new Float64Array(n);
    const onGround = new Uint8Array(n);

    for (let i = 0; i < n; i++) {
      const s = states[i];
      timestamp[i] = s.timestamp;
      icao24[i] = s.aircraft.icao24;
      callsign[i] = s.aircraft.callsign ?? null;
      latitude[i] = s.position.latitude;
      longitude[i] = s.position.longitude;
      altitude[i] = s.position.altitude;
      groundSpeed[i] = s.velocity.groundSpeed;
      track[i] = s.velocity.track;
      verticalRate[i] = s.velocity.verticalRate;
      onGround[i] = s.onGround ? 1 : 0;
    }

    return {
      length: n,
      columns: {
        timestamp,
        icao24,
        callsign,
        latitude,
        longitude,
        altitude,
        groundSpeed,
        track,
        verticalRate,
        onGround,
      },
      schema: [
        { name: "timestamp", type: "float64" },
        { name: "icao24", type: "string" },
        { name: "callsign", type: "string_nullable" },
        { name: "latitude", type: "float64" },
        { name: "longitude", type: "float64" },
        { name: "altitude", type: "float64" },
        { name: "groundSpeed", type: "float64" },
        { name: "track", type: "float64" },
        { name: "verticalRate", type: "float64" },
        { name: "onGround", type: "uint8" },
      ],
    };
  }

  /**
   * Export to newline-delimited JSON format.
   * Compatible with BigQuery, Spark, DuckDB, and other big data tools.
   * Can be converted to Parquet via:
   *   duckdb -c "COPY (SELECT * FROM read_json_auto('data.ndjson')) TO 'data.parquet'"
   */
  toNDJSON(states: FlightState[]): string {
    return states
      .map((s) =>
        JSON.stringify({
          timestamp: s.timestamp,
          icao24: s.aircraft.icao24,
          callsign: s.aircraft.callsign ?? null,
          latitude: s.position.latitude,
          longitude: s.position.longitude,
          altitude: s.position.altitude,
          groundSpeed: s.velocity.groundSpeed,
          track: s.velocity.track,
          verticalRate: s.velocity.verticalRate,
          onGround: s.onGround,
        }),
      )
      .join("\n");
  }

  /**
   * Export column statistics useful for data profiling.
   * Returns min, max, mean, and null count for each numeric column.
   */
  stats(
    data: ColumnarFlightData,
  ): Record<
    string,
    { min: number; max: number; mean: number; nullCount: number }
  > {
    const result: Record<
      string,
      { min: number; max: number; mean: number; nullCount: number }
    > = {};

    for (const col of data.schema) {
      if (col.type === "float64") {
        const arr = data.columns[
          col.name as keyof typeof data.columns
        ] as Float64Array;
        let min = Infinity;
        let max = -Infinity;
        let sum = 0;
        for (let i = 0; i < arr.length; i++) {
          const v = arr[i];
          if (v < min) min = v;
          if (v > max) max = v;
          sum += v;
        }
        result[col.name] = {
          min,
          max,
          mean: arr.length > 0 ? sum / arr.length : 0,
          nullCount: 0,
        };
      }
    }

    return result;
  }
}
