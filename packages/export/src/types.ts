/**
 * Supported export formats.
 */
export type ExportFormat = "csv" | "json" | "parquet" | "fdr";

/**
 * Export configuration.
 */
export interface ExportConfig {
  /** Output format */
  format: ExportFormat;
  /** Fields to include (default: all) */
  fields?: string[];
  /** Whether to include headers (CSV only, default: true) */
  headers?: boolean;
  /** Delimiter for CSV (default: ",") */
  delimiter?: string;
  /** Whether to pretty-print JSON (default: false) */
  prettyPrint?: boolean;
  /** Timestamp format: "iso" | "unix" | "unix_ms" (default: "iso") */
  timestampFormat?: "iso" | "unix" | "unix_ms";
}

/**
 * Report template types.
 */
export type ReportTemplate = "flight_summary" | "performance" | "health" | "custom";

/**
 * Flight summary report.
 */
export interface FlightSummary {
  /** Aircraft ICAO24 address */
  icao24: string;
  /** Callsign, if available */
  callsign?: string;
  /** First state timestamp */
  startTime: number;
  /** Last state timestamp */
  endTime: number;
  /** Flight duration in seconds */
  duration: number;
  /** Number of data points */
  dataPoints: number;
  /** Starting position */
  startPosition: { latitude: number; longitude: number; altitude: number };
  /** Ending position */
  endPosition: { latitude: number; longitude: number; altitude: number };
  /** Maximum altitude in meters */
  maxAltitude: number;
  /** Maximum ground speed in m/s */
  maxGroundSpeed: number;
  /** Average ground speed in m/s */
  avgGroundSpeed: number;
  /** Maximum vertical rate in m/s (absolute) */
  maxVerticalRate: number;
  /** Total distance traveled in meters (great circle sum) */
  totalDistance: number;
}

/**
 * Performance report for a flight or time period.
 */
export interface PerformanceReport {
  /** Flight summary */
  summary: FlightSummary;
  /** Altitude profile: array of [timestamp, altitude] pairs */
  altitudeProfile: Array<[number, number]>;
  /** Speed profile: array of [timestamp, groundSpeed] pairs */
  speedProfile: Array<[number, number]>;
  /** Vertical rate profile: array of [timestamp, verticalRate] pairs */
  verticalRateProfile: Array<[number, number]>;
  /** Phase of flight breakdown (climb %, cruise %, descent %) */
  phaseBreakdown: {
    climb: number;
    cruise: number;
    descent: number;
    ground: number;
  };
}
