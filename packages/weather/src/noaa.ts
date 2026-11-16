import type { MetarData, NOAAConfig, TafData } from "./types";

const DEFAULT_BASE_URL = "https://aviationweather.gov";
const DEFAULT_TIMEOUT = 10_000;

/** HTTP status codes that warrant a retry. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** Maximum retry attempts. */
const MAX_RETRIES = 2;

/** Base delay in ms for exponential backoff. */
const RETRY_BASE_DELAY = 500;

/**
 * Client for NOAA Aviation Weather data.
 *
 * Fetches METAR observations, TAF forecasts, and upper air data
 * from the Aviation Weather Center.
 */
export class NOAAClient {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(config: NOAAConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Fetch the latest METAR for an airport.
   *
   * @param station - ICAO airport identifier (e.g., "KJFK")
   * @returns MetarData or null when no data is available or the API is unreachable
   */
  async getMetar(station: string): Promise<MetarData | null> {
    const url = `${this.baseUrl}/api/data/metar?ids=${encodeURIComponent(station)}&format=json&taf=false&hours=2`;

    const data = await this.fetchJsonArray(url);
    if (!data || data.length === 0) return null;

    return this.parseMetar(data[0]);
  }

  /**
   * Fetch the latest TAF for an airport.
   *
   * @param station - ICAO airport identifier (e.g., "KJFK")
   * @returns TafData or null when no data is available or the API is unreachable
   */
  async getTaf(station: string): Promise<TafData | null> {
    const url = `${this.baseUrl}/api/data/taf?ids=${encodeURIComponent(station)}&format=json`;

    const data = await this.fetchJsonArray(url);
    if (!data || data.length === 0) return null;

    return this.parseTaf(data[0]);
  }

  /**
   * Fetch METARs for multiple stations.
   */
  async getMetars(stations: string[]): Promise<MetarData[]> {
    const ids = stations.join(",");
    const url = `${this.baseUrl}/api/data/metar?ids=${encodeURIComponent(ids)}&format=json&taf=false&hours=2`;

    const data = await this.fetchJsonArray(url);
    if (!data) return [];

    return data.map((d) => this.parseMetar(d));
  }

  /**
   * Fetch a JSON array from the NOAA API with retry and graceful fallback.
   * Returns null when the API is unreachable or returns an unexpected format,
   * rather than throwing.
   */
  private async fetchJsonArray(
    url: string,
  ): Promise<Array<Record<string, unknown>> | null> {
    let _lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(this.timeout),
        });

        if (response.ok) {
          const body = await response.json();
          // Validate that the response is actually an array
          if (!Array.isArray(body)) return null;
          return body as Array<Record<string, unknown>>;
        }

        // Non-retryable HTTP error
        if (!RETRYABLE_STATUS_CODES.has(response.status)) {
          return null;
        }

        _lastError = new Error(
          `NOAA API error: ${response.status} ${response.statusText}`,
        );
      } catch (error) {
        // Network / timeout errors are retryable
        _lastError = error;
      }

      // Exponential backoff before next attempt
      if (attempt < MAX_RETRIES) {
        const delay =
          RETRY_BASE_DELAY * 2 ** attempt * (0.5 + Math.random() * 0.5);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Graceful fallback: return null instead of throwing
    return null;
  }

  /**
   * Parse raw METAR JSON from NOAA into a MetarData object.
   */
  private parseMetar(raw: Record<string, unknown>): MetarData {
    const knotsToMs = (knots: number) => knots * 0.514444;
    const milesToMeters = (miles: number) => miles * 1609.34;

    return {
      station: String(raw["icaoId"] ?? raw["station_id"] ?? ""),
      timestamp: raw["reportTime"]
        ? new Date(String(raw["reportTime"])).getTime()
        : Date.now(),
      raw: String(raw["rawOb"] ?? raw["rawText"] ?? ""),
      windDirection:
        raw["wdir"] === "VRB" ? null : this.safeNumber(raw["wdir"], 0),
      windSpeed: knotsToMs(this.safeNumber(raw["wspd"], 0)),
      windGust: raw["wgst"]
        ? knotsToMs(this.safeNumber(raw["wgst"], 0))
        : undefined,
      visibility: milesToMeters(this.safeNumber(raw["visib"] ?? raw["visibility_statute_mi"], 10)),
      temperature: this.safeNumber(raw["temp"], 0),
      dewpoint: this.safeNumber(raw["dewp"], 0),
      altimeter: this.safeNumber(raw["altim"], 1013.25),
      flightCategory: this.classifyFlightCategory(
        milesToMeters(this.safeNumber(raw["visib"], 10)),
      ),
    };
  }

  /**
   * Parse raw TAF JSON from NOAA into a TafData object.
   */
  private parseTaf(raw: Record<string, unknown>): TafData {
    return {
      station: String(raw["icaoId"] ?? raw["station_id"] ?? ""),
      issued: raw["issueTime"]
        ? new Date(String(raw["issueTime"])).getTime()
        : Date.now(),
      validFrom: raw["validTimeFrom"]
        ? new Date(String(raw["validTimeFrom"])).getTime()
        : Date.now(),
      validTo: raw["validTimeTo"]
        ? new Date(String(raw["validTimeTo"])).getTime()
        : Date.now(),
      raw: String(raw["rawTAF"] ?? raw["rawText"] ?? ""),
      periods: [],
    };
  }

  /**
   * Classify flight category based on visibility and ceiling.
   */
  private classifyFlightCategory(
    visibilityMeters: number,
  ): "VFR" | "MVFR" | "IFR" | "LIFR" {
    if (visibilityMeters < 1609.34) return "LIFR"; // < 1 SM
    if (visibilityMeters < 4828.03) return "IFR"; // < 3 SM
    if (visibilityMeters < 8046.72) return "MVFR"; // < 5 SM
    return "VFR";
  }

  /**
   * Safely coerce a value to a finite number, returning the fallback
   * if the value is null, undefined, or non-finite.
   */
  private safeNumber(value: unknown, fallback: number): number {
    if (value == null) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
}
