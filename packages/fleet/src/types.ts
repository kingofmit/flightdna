import type { Aircraft } from "@flightdna/core";
import type { TwinState } from "@flightdna/twin";

/**
 * Aircraft entry within a fleet.
 */
export interface FleetAircraft {
  /** Aircraft metadata */
  aircraft: Aircraft;
  /** Latest digital twin state, if available */
  twinState?: TwinState;
  /** When this aircraft was added to the fleet */
  addedAt: number;
  /** Tags for grouping (e.g., "hub-SFO", "long-haul") */
  tags: string[];
}

/**
 * Fleet — collection of tracked aircraft.
 */
export interface Fleet {
  /** Fleet name */
  name: string;
  /** Aircraft in the fleet, keyed by ICAO24 */
  aircraft: Map<string, FleetAircraft>;
  /** When the fleet was created */
  createdAt: number;
}

/**
 * Fleet-wide analytics summary.
 */
export interface FleetAnalytics {
  /** Total number of aircraft in the fleet */
  aircraftCount: number;
  /** Number of aircraft currently airborne */
  airborneCount: number;
  /** Average health score across all aircraft (0-1) */
  averageHealth: number;
  /** Number of active anomalies across the fleet */
  totalAnomalies: number;
  /** Total flight hours tracked across all aircraft */
  totalFlightHours: number;
  /** Breakdown by aircraft type */
  byType: Map<string, { count: number; avgHealth: number }>;
  /** Timestamp of this analytics snapshot */
  timestamp: number;
}

/**
 * Comparison between two aircraft.
 */
export interface AircraftComparison {
  /** First aircraft ICAO24 */
  icao24A: string;
  /** Second aircraft ICAO24 */
  icao24B: string;
  /** Health score difference (A - B) */
  healthDelta: number;
  /** Flight hours difference (A - B) */
  flightHoursDelta: number;
  /** Performance comparison */
  performance: {
    /** Average Mach difference */
    machDelta: number;
    /** Average climb rate difference */
    climbRateDelta: number;
  };
  /** Anomaly count difference (A - B) */
  anomalyDelta: number;
}

/**
 * Type-level performance baseline computed from all aircraft of a given type.
 */
export interface TypeBaseline {
  /** Aircraft type designator (e.g., "B738") */
  typeDesignator: string;
  /** Number of aircraft sampled to compute this baseline */
  sampleSize: number;
  /** Climb rate statistics in m/s */
  climbRate: { mean: number; stddev: number };
  /** Cruise Mach statistics */
  cruiseMach: { mean: number; stddev: number };
  /** Health score statistics (0-1) */
  healthScore: { mean: number; stddev: number };
}

/**
 * Individual aircraft score relative to its type baseline.
 */
export interface AircraftScore {
  /** ICAO24 hex address */
  icao24: string;
  /** Aircraft type designator */
  typeDesignator: string;
  /** Score for climb rate (0-1, 1 = at or above average) */
  climbRateScore: number;
  /** Score for cruise Mach (0-1, 1 = at or above average) */
  cruiseMachScore: number;
  /** Score for health (0-1, 1 = at or above average) */
  healthScore: number;
  /** Overall composite score (0-1) */
  overallScore: number;
}

/**
 * Statistics for a specific route.
 */
export interface RouteStats {
  /** Origin airport ICAO code */
  origin: string;
  /** Destination airport ICAO code */
  destination: string;
  /** Number of flights observed on this route */
  flightCount: number;
  /** Average flight time in seconds */
  averageFlightTime: number;
  /** Average ground speed in m/s */
  averageGroundSpeed: number;
  /** Aircraft ICAO24 addresses that have flown this route */
  aircraftSeen: string[];
}
