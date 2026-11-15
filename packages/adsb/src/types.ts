/**
 * OpenSky Network API configuration.
 */
export interface OpenSkyConfig {
  /** API base URL (default: https://opensky-network.org/api) */
  baseUrl?: string;
  /** Username for authenticated access (higher rate limits) */
  username?: string;
  /** Password for authenticated access */
  password?: string;
  /** Request timeout in milliseconds (default: 15000) */
  timeout?: number;
}

/**
 * State vector as returned by the OpenSky Network REST API.
 * See: https://openskynetwork.github.io/opensky-api/rest.html
 */
export interface OpenSkyStateVector {
  /** ICAO24 transponder address (hex) */
  icao24: string;
  /** Callsign (8 chars max), may be null */
  callsign: string | null;
  /** Country of origin */
  originCountry: string;
  /** Unix timestamp of last position update */
  timePosition: number | null;
  /** Unix timestamp of last update */
  lastContact: number;
  /** Longitude in degrees */
  longitude: number | null;
  /** Latitude in degrees */
  latitude: number | null;
  /** Barometric altitude in meters */
  baroAltitude: number | null;
  /** Whether the aircraft is on ground */
  onGround: boolean;
  /** Ground speed in m/s */
  velocity: number | null;
  /** Track angle in degrees (clockwise from North) */
  trueTrack: number | null;
  /** Vertical rate in m/s */
  verticalRate: number | null;
  /** List of sensor IDs */
  sensors: number[] | null;
  /** Geometric altitude in meters */
  geoAltitude: number | null;
  /** Transponder squawk code */
  squawk: string | null;
  /** Whether this is a special purpose indicator */
  spi: boolean;
  /** Position source: 0=ADS-B, 1=ASTERIX, 2=MLAT, 3=FLARM */
  positionSource: number;
  /** Aircraft category (DO-260B) */
  category: number;
}

/**
 * Response from the OpenSky /states/all endpoint.
 */
export interface OpenSkyResponse {
  /** Unix timestamp of the response */
  time: number;
  /** Array of state vectors */
  states: OpenSkyStateVector[];
}

/**
 * Query parameters for the OpenSky states endpoint.
 */
export interface OpenSkyQueryParams {
  /** Filter by ICAO24 addresses */
  icao24?: string[];
  /** Unix timestamp for historical data (requires authentication) */
  time?: number;
  /** Bounding box: [minLatitude, maxLatitude, minLongitude, maxLongitude] */
  bounds?: [number, number, number, number];
}

/**
 * ADS-B message type codes.
 */
export type ADSBMessageType =
  | "identification"
  | "surface_position"
  | "airborne_position"
  | "airborne_velocity"
  | "surveillance_status"
  | "operational_status"
  | "unknown";

/**
 * Raw ADS-B message before decoding.
 */
export interface RawADSBMessage {
  /** Raw hex string of the message */
  hex: string;
  /** Timestamp when the message was received */
  timestamp: number;
  /** Downlink format (0-24) */
  downlinkFormat: number;
  /** Message payload bytes */
  payload: Uint8Array;
}

/**
 * Decoded ADS-B message.
 */
export interface DecodedADSBMessage {
  /** Message type */
  type: ADSBMessageType;
  /** ICAO24 address */
  icao24: string;
  /** Type code (TC field, 1-31) */
  typeCode: number;
  /** Decoded timestamp */
  timestamp: number;
  /** Decoded data specific to the message type */
  data: Record<string, unknown>;
}

/**
 * Aircraft metadata from public databases.
 */
export interface AircraftMetadata {
  /** ICAO24 transponder address */
  icao24: string;
  /** Aircraft registration */
  registration: string;
  /** Manufacturer and model */
  model: string;
  /** ICAO type designator */
  typeDesignator: string;
  /** Serial number */
  serialNumber?: string;
  /** Operator/airline */
  operator?: string;
  /** Country of registration */
  country: string;
}
