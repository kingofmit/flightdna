import type { MetarData, NOAAConfig, TafData } from "./types";

const DEFAULT_BASE_URL = "https://aviationweather.gov";
const DEFAULT_TIMEOUT = 10_000;

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
   */
  async getMetar(station: string): Promise<MetarData | null> {
    const url = `${this.baseUrl}/api/data/metar?ids=${encodeURIComponent(station)}&format=json&taf=false&hours=2`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(
        `NOAA API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as Array<Record<string, unknown>>;
    if (!data || data.length === 0) return null;

    return this.parseMetar(data[0]);
  }

  /**
   * Fetch the latest TAF for an airport.
   *
   * @param station - ICAO airport identifier (e.g., "KJFK")
   */
  async getTaf(station: string): Promise<TafData | null> {
    const url = `${this.baseUrl}/api/data/taf?ids=${encodeURIComponent(station)}&format=json`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(
        `NOAA API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as Array<Record<string, unknown>>;
    if (!data || data.length === 0) return null;

    return this.parseTaf(data[0]);
  }

  /**
   * Fetch METARs for multiple stations.
   */
  async getMetars(stations: string[]): Promise<MetarData[]> {
    const ids = stations.join(",");
    const url = `${this.baseUrl}/api/data/metar?ids=${encodeURIComponent(ids)}&format=json&taf=false&hours=2`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(
        `NOAA API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as Array<Record<string, unknown>>;
    if (!data) return [];

    return data.map((d) => this.parseMetar(d));
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
        raw["wdir"] === "VRB" ? null : Number(raw["wdir"] ?? 0),
      windSpeed: knotsToMs(Number(raw["wspd"] ?? 0)),
      windGust: raw["wgst"]
        ? knotsToMs(Number(raw["wgst"]))
        : undefined,
      visibility: milesToMeters(Number(raw["visib"] ?? raw["visibility_statute_mi"] ?? 10)),
      temperature: Number(raw["temp"] ?? 0),
      dewpoint: Number(raw["dewp"] ?? 0),
      altimeter: Number(raw["altim"] ?? 1013.25),
      flightCategory: this.classifyFlightCategory(
        milesToMeters(Number(raw["visib"] ?? 10)),
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
}
