/**
 * Atmospheric conditions at a specific altitude and location.
 */
export interface AtmosphericConditions {
  /** Temperature in Kelvin */
  temperature: number;
  /** Pressure in Pascals */
  pressure: number;
  /** Air density in kg/m^3 */
  density: number;
  /** Speed of sound in m/s */
  speedOfSound: number;
  /** Dynamic viscosity in Pa*s */
  dynamicViscosity: number;
  /** Altitude in meters (MSL) */
  altitude: number;
}

/**
 * Wind vector at a specific location and altitude.
 */
export interface Wind {
  /** Wind speed in m/s */
  speed: number;
  /** Wind direction in degrees (direction wind is coming FROM, 0=North) */
  direction: number;
  /** North component in m/s (positive = from south) */
  northComponent: number;
  /** East component in m/s (positive = from west) */
  eastComponent: number;
  /** Vertical component in m/s (positive = updraft) */
  verticalComponent?: number;
}

/**
 * Complete weather state at a location.
 */
export interface WeatherState {
  /** Atmospheric conditions */
  atmosphere: AtmosphericConditions;
  /** Wind at this location/altitude */
  wind: Wind;
  /** Visibility in meters */
  visibility?: number;
  /** Cloud cover (0-1, 0=clear, 1=overcast) */
  cloudCover?: number;
  /** Precipitation type */
  precipitation?: "none" | "rain" | "snow" | "ice" | "mixed";
  /** Turbulence intensity (0-1) */
  turbulence?: number;
  /** Timestamp of the weather observation */
  timestamp: number;
}

/**
 * Parsed METAR observation data.
 */
export interface MetarData {
  /** Station ICAO identifier (e.g., "KJFK") */
  station: string;
  /** Observation timestamp */
  timestamp: number;
  /** Raw METAR string */
  raw: string;
  /** Wind direction in degrees */
  windDirection: number | null;
  /** Wind speed in m/s */
  windSpeed: number;
  /** Wind gust speed in m/s, if present */
  windGust?: number;
  /** Visibility in meters */
  visibility: number;
  /** Temperature in Celsius */
  temperature: number;
  /** Dewpoint in Celsius */
  dewpoint: number;
  /** Altimeter setting in hPa (QNH) */
  altimeter: number;
  /** Flight category: VFR, MVFR, IFR, LIFR */
  flightCategory?: "VFR" | "MVFR" | "IFR" | "LIFR";
}

/**
 * Parsed TAF forecast data.
 */
export interface TafData {
  /** Station ICAO identifier */
  station: string;
  /** Issue timestamp */
  issued: number;
  /** Valid from timestamp */
  validFrom: number;
  /** Valid to timestamp */
  validTo: number;
  /** Raw TAF string */
  raw: string;
  /** Forecast periods */
  periods: Array<{
    from: number;
    to: number;
    windDirection: number | null;
    windSpeed: number;
    visibility: number;
    weather?: string;
  }>;
}

/**
 * NOAA client configuration.
 */
export interface NOAAConfig {
  /** API base URL (default: https://aviationweather.gov) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
}
