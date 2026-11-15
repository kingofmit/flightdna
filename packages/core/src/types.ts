/**
 * Geographic position in WGS84 coordinates.
 */
export interface Position {
  /** Latitude in degrees (-90 to 90) */
  latitude: number;
  /** Longitude in degrees (-180 to 180) */
  longitude: number;
  /** Barometric altitude in meters above mean sea level */
  altitude: number;
  /** Geometric (GPS) altitude in meters, if available */
  geometricAltitude?: number;
}

/**
 * Velocity vector in the NED (North-East-Down) frame.
 */
export interface Velocity {
  /** Ground speed in m/s */
  groundSpeed: number;
  /** True airspeed in m/s, if estimated */
  trueAirspeed?: number;
  /** Track angle in degrees (0 = North, clockwise) */
  track: number;
  /** Vertical rate in m/s (positive = climbing) */
  verticalRate: number;
  /** Heading in degrees, if available */
  heading?: number;
}

/**
 * Aircraft attitude (orientation) in the body frame.
 */
export interface Attitude {
  /** Roll angle in radians (positive = right wing down) */
  roll: number;
  /** Pitch angle in radians (positive = nose up) */
  pitch: number;
  /** Yaw angle in radians (positive = nose right) */
  yaw: number;
}

/**
 * Aircraft type classification.
 */
export type AircraftType =
  | "narrowbody"
  | "widebody"
  | "regional"
  | "turboprop"
  | "business_jet"
  | "general_aviation"
  | "helicopter"
  | "military"
  | "unknown";

/**
 * Aircraft identity and metadata.
 */
export interface Aircraft {
  /** ICAO 24-bit transponder address (hex string) */
  icao24: string;
  /** Aircraft callsign */
  callsign?: string;
  /** Aircraft registration (tail number) */
  registration?: string;
  /** Aircraft type designator (e.g., "B738", "A320") */
  typeDesignator?: string;
  /** Aircraft type classification */
  type?: AircraftType;
  /** Operator or airline name */
  operator?: string;
  /** Country of registration */
  country?: string;
}

/**
 * Complete flight state at a point in time.
 */
export interface FlightState {
  /** Aircraft identity */
  aircraft: Aircraft;
  /** Timestamp in milliseconds since Unix epoch */
  timestamp: number;
  /** Position */
  position: Position;
  /** Velocity */
  velocity: Velocity;
  /** Attitude estimate, if available */
  attitude?: Attitude;
  /** Whether the aircraft is on the ground */
  onGround: boolean;
  /** Squawk transponder code */
  squawk?: string;
  /** Data source identifier */
  source: string;
}

/**
 * Performance envelope boundaries for an aircraft type.
 */
export interface PerformanceEnvelope {
  /** Maximum operating speed (VMO) in m/s */
  maxSpeed: number;
  /** Maximum operating Mach (MMO) */
  maxMach: number;
  /** Service ceiling in meters */
  serviceCeiling: number;
  /** Maximum rate of climb in m/s */
  maxClimbRate: number;
  /** Maximum takeoff weight in kg */
  maxTakeoffWeight: number;
  /** Stall speed (clean) in m/s at typical weight */
  stallSpeed: number;
}

/**
 * Configuration for data sources.
 */
export interface DataSourceConfig {
  /** Enable OpenSky Network as a data source */
  opensky?: boolean;
  /** OpenSky API credentials (optional, increases rate limit) */
  openskyCredentials?: { username: string; password: string };
  /** Enable NOAA weather enrichment */
  weather?: boolean;
}

/**
 * Main FlightDNA configuration.
 */
export interface FlightDNAConfig {
  /** Update interval in milliseconds (default: 10000) */
  updateInterval?: number;
  /** Data source configuration */
  sources?: DataSourceConfig;
  /** Enable flight dynamics model (default: true) */
  dynamics?: boolean;
  /** Enable digital twin state estimation (default: true) */
  twinEnabled?: boolean;
}

/**
 * Event types emitted by FlightDNA.
 */
export type FlightDNAEvent =
  | "stateUpdate"
  | "anomaly"
  | "trackStart"
  | "trackEnd"
  | "error";

/**
 * Event payload map.
 */
export interface FlightDNAEventMap {
  stateUpdate: FlightState;
  anomaly: { icao24: string; type: string; message: string; severity: number };
  trackStart: { icao24: string; timestamp: number };
  trackEnd: { icao24: string; timestamp: number; reason: string };
  error: { message: string; code?: string };
}
