import type { FlightState, Position, Velocity } from "@flightdna/core";
import type {
  OpenSkyConfig,
  OpenSkyQueryParams,
  OpenSkyResponse,
  OpenSkyStateVector,
} from "./types";

const DEFAULT_BASE_URL = "https://opensky-network.org/api";
const DEFAULT_TIMEOUT = 15_000;

/** HTTP status codes that warrant a retry. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** Maximum number of retry attempts for transient failures. */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff. */
const RETRY_BASE_DELAY = 1_000;

/**
 * Client for the OpenSky Network REST API.
 *
 * Provides access to live and historical ADS-B surveillance data.
 * See: https://openskynetwork.github.io/opensky-api/rest.html
 */
export class OpenSkyClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly authHeader: string | null;

  constructor(config: OpenSkyConfig = {}) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;

    if (config.username && config.password) {
      const credentials = btoa(`${config.username}:${config.password}`);
      this.authHeader = `Basic ${credentials}`;
    } else {
      this.authHeader = null;
    }
  }

  /**
   * Get current state vectors for aircraft.
   * Without parameters, returns all aircraft (requires authentication).
   */
  async getStates(params: OpenSkyQueryParams = {}): Promise<FlightState[]> {
    const url = new URL(`${this.baseUrl}/states/all`);

    if (params.time) {
      url.searchParams.set("time", String(params.time));
    }
    if (params.icao24 && params.icao24.length > 0) {
      for (const addr of params.icao24) {
        url.searchParams.append("icao24", addr.toLowerCase());
      }
    }
    if (params.bounds) {
      const [minLat, maxLat, minLon, maxLon] = params.bounds;
      url.searchParams.set("lamin", String(minLat));
      url.searchParams.set("lamax", String(maxLat));
      url.searchParams.set("lomin", String(minLon));
      url.searchParams.set("lomax", String(maxLon));
    }

    const response = await this.fetchWithRetry(url.toString());
    return this.parseResponse(response);
  }

  /**
   * Get flights for a specific aircraft within a time range.
   */
  async getFlights(
    icao24: string,
    begin: number,
    end: number,
  ): Promise<Array<{
    icao24: string;
    callsign: string | null;
    departureAirport: string | null;
    arrivalAirport: string | null;
    firstSeen: number;
    lastSeen: number;
  }>> {
    const url = new URL(`${this.baseUrl}/flights/aircraft`);
    url.searchParams.set("icao24", icao24.toLowerCase());
    url.searchParams.set("begin", String(begin));
    url.searchParams.set("end", String(end));

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.authHeader) {
      headers["Authorization"] = this.authHeader;
    }

    const response = await this.fetchResponseWithRetry(url.toString(), headers);

    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data;
  }

  /**
   * Parse an OpenSky response into FlightState objects.
   */
  private parseResponse(response: OpenSkyResponse): FlightState[] {
    if (!response || !Array.isArray(response.states)) return [];

    const results: FlightState[] = [];
    for (const sv of response.states) {
      const state = this.safeStateVectorToFlightState(sv);
      if (state) results.push(state);
    }
    return results;
  }

  /**
   * Convert an OpenSky state vector to a FlightState.
   * Returns null if the state vector is malformed beyond recovery.
   */
  private safeStateVectorToFlightState(sv: OpenSkyStateVector): FlightState | null {
    if (!sv || typeof sv.icao24 !== "string" || !sv.icao24) {
      return null;
    }

    const latitude = this.safeNumber(sv.latitude, 0);
    const longitude = this.safeNumber(sv.longitude, 0);
    const baroAltitude = this.safeNumber(sv.baroAltitude, 0);
    const geoAltitude = sv.geoAltitude != null ? this.safeNumber(sv.geoAltitude, undefined) : undefined;

    const position: Position = {
      latitude,
      longitude,
      altitude: baroAltitude,
      geometricAltitude: geoAltitude,
    };

    const velocity: Velocity = {
      groundSpeed: this.safeNumber(sv.velocity, 0),
      track: this.safeNumber(sv.trueTrack, 0),
      verticalRate: this.safeNumber(sv.verticalRate, 0),
    };

    const timePosition = this.safeNumber(sv.timePosition, null);
    const lastContact = this.safeNumber(sv.lastContact, 0);
    const timestampSec = timePosition ?? lastContact;

    return {
      aircraft: {
        icao24: sv.icao24,
        callsign: sv.callsign?.trim() || undefined,
        country: sv.originCountry,
      },
      timestamp: timestampSec * 1000,
      position,
      velocity,
      onGround: Boolean(sv.onGround),
      squawk: sv.squawk ?? undefined,
      source: "opensky",
    };
  }

  /**
   * Safely coerce a value to a finite number, returning the fallback if
   * the value is null, undefined, or non-finite (NaN / Infinity).
   */
  private safeNumber<T>(value: unknown, fallback: T): number | T {
    if (value == null) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /**
   * Fetch an OpenSky JSON response with retry and exponential backoff.
   */
  private async fetchWithRetry(url: string): Promise<OpenSkyResponse> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.authHeader) {
      headers["Authorization"] = this.authHeader;
    }

    const response = await this.fetchResponseWithRetry(url, headers);
    const body = await response.json();

    // Defend against unexpected response shapes
    if (body == null || typeof body !== "object") {
      return { time: 0, states: null };
    }

    return body as OpenSkyResponse;
  }

  /**
   * Perform an HTTP fetch with retry logic for transient failures.
   */
  private async fetchResponseWithRetry(
    url: string,
    headers: Record<string, string>,
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(this.timeout),
        });

        if (response.ok) {
          return response;
        }

        // Non-retryable HTTP error
        if (!RETRYABLE_STATUS_CODES.has(response.status)) {
          throw new Error(
            `OpenSky API error: ${response.status} ${response.statusText}`,
          );
        }

        // Retryable HTTP error — fall through to backoff
        lastError = new Error(
          `OpenSky API error: ${response.status} ${response.statusText}`,
        );
      } catch (error) {
        // Timeout, abort, and network errors are retryable
        const isRetryable =
          error instanceof DOMException ||
          (error instanceof TypeError && /fetch|network/i.test(error.message));

        if (isRetryable) {
          lastError = error;
        } else {
          // Propagate non-retryable errors (e.g., our own thrown HTTP errors)
          throw error;
        }
      }

      // Exponential backoff with jitter before next retry
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY * 2 ** attempt * (0.5 + Math.random() * 0.5);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError ?? new Error("OpenSky API request failed after retries");
  }
}
