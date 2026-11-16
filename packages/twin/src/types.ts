import type { FlightState, Position, Velocity } from "@flightdna/core";
import type { TurbulenceEstimate } from "./turbulence";

/**
 * Flight phase classifications.
 */
export type FlightPhase =
  | "ground"
  | "takeoff"
  | "climb"
  | "cruise"
  | "descent"
  | "approach"
  | "landing"
  | "unknown";

/**
 * Digital twin configuration.
 */
export interface TwinConfig {
  /** ICAO24 address of the aircraft */
  icao24: string;
  /** Process noise for the Kalman filter (default: 1.0) */
  processNoise?: number;
  /** Measurement noise for ADS-B positions (default: 50 meters) */
  measurementNoise?: number;
  /** Enable health monitoring (default: true) */
  healthMonitoring?: boolean;
  /** Enable anomaly detection (default: true) */
  anomalyDetection?: boolean;
  /** Anomaly detection sensitivity (0-1, default: 0.5) */
  anomalySensitivity?: number;
}

/**
 * Complete digital twin state at a point in time.
 */
export interface TwinState {
  /** ICAO24 address */
  icao24: string;
  /** Timestamp of last update */
  timestamp: number;
  /** Estimated position (Kalman-filtered) */
  position: Position;
  /** Estimated velocity (Kalman-filtered) */
  velocity: Velocity;
  /** Performance estimates */
  performance: {
    /** Estimated Mach number */
    mach: number;
    /** Rate of climb in m/s */
    climbRate: number;
    /** Estimated fuel flow in kg/s (if model available) */
    fuelFlow?: number;
    /** Estimated lift-to-drag ratio */
    liftToDrag?: number;
  };
  /** Health indicators */
  health: HealthIndicator[];
  /** Active anomalies */
  anomalies: Anomaly[];
  /** Total flight hours tracked */
  flightHours: number;
  /** Number of state updates received */
  updateCount: number;
  /** Whether the aircraft is currently airborne */
  airborne: boolean;
  /** Current flight phase */
  flightPhase: FlightPhase;
  /** Turbulence estimate, if detected */
  turbulence?: TurbulenceEstimate | null;
}

/**
 * Health indicator type classifications.
 */
export type HealthIndicatorType =
  | "engine_performance"
  | "structural_fatigue"
  | "fuel_efficiency"
  | "navigation_accuracy"
  | "overall";

/**
 * Health indicator for a specific system.
 */
export interface HealthIndicator {
  /** Type of health indicator */
  type: HealthIndicatorType;
  /** Health value (0-1, 1 = perfect health) */
  value: number;
  /** Trend: positive = improving, negative = degrading */
  trend: number;
  /** Confidence in the estimate (0-1) */
  confidence: number;
  /** Last update timestamp */
  timestamp: number;
}

/**
 * Anomaly severity levels.
 */
export type AnomalySeverity = "info" | "warning" | "critical";

/**
 * Detected anomaly in aircraft behavior.
 */
export interface Anomaly {
  /** Unique anomaly identifier */
  id: string;
  /** Type of anomaly */
  type: string;
  /** Human-readable description */
  message: string;
  /** Severity level */
  severity: AnomalySeverity;
  /** Deviation score (standard deviations from expected) */
  deviation: number;
  /** When the anomaly was first detected */
  detectedAt: number;
  /** The flight state that triggered this anomaly */
  triggerState?: FlightState;
}

/**
 * Kalman filter state vector.
 * [lat, lon, alt, vN, vE, vD, heading, turnRate] — 8-dimensional state
 */
export interface KalmanState {
  /** State vector [lat, lon, alt, vN, vE, vD, heading, turnRate] */
  x: number[];
  /** State covariance matrix (8x8) */
  P: number[][];
  /** Last update timestamp */
  timestamp: number;
}

/**
 * Kalman filter configuration.
 */
export interface KalmanConfig {
  /** Process noise scalar (Q multiplier) */
  processNoise: number;
  /** Measurement noise for position (meters) */
  positionNoise: number;
  /** Measurement noise for velocity (m/s) */
  velocityNoise: number;
  /** Enable innovation-based adaptive noise estimation */
  adaptiveNoise?: boolean;
}
