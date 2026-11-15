import type { FlightState, Position, Velocity } from "@flightdna/core";
import type {
  OpenSkyConfig,
  OpenSkyQueryParams,
  OpenSkyResponse,
  OpenSkyStateVector,
} from "./types";

const DEFAULT_BASE_URL = "https://opensky-network.org/api";
const DEFAULT_TIMEOUT = 15_000;

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

    const response = await this.fetch(url.toString());
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

    const response = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(
        `OpenSky API error: ${response.status} ${response.statusText}`,
      );
    }

    return response.json();
  }

  /**
   * Parse an OpenSky response into FlightState objects.
   */
  private parseResponse(response: OpenSkyResponse): FlightState[] {
    if (!response.states) return [];

    return response.states.map((sv) => this.stateVectorToFlightState(sv));
  }

  /**
   * Convert an OpenSky state vector to a FlightState.
   */
  private stateVectorToFlightState(sv: OpenSkyStateVector): FlightState {
    const position: Position = {
      latitude: sv.latitude ?? 0,
      longitude: sv.longitude ?? 0,
      altitude: sv.baroAltitude ?? 0,
      geometricAltitude: sv.geoAltitude ?? undefined,
    };

    const velocity: Velocity = {
      groundSpeed: sv.velocity ?? 0,
      track: sv.trueTrack ?? 0,
      verticalRate: sv.verticalRate ?? 0,
    };

    return {
      aircraft: {
        icao24: sv.icao24,
        callsign: sv.callsign?.trim() || undefined,
        country: sv.originCountry,
      },
      timestamp: (sv.timePosition ?? sv.lastContact) * 1000,
      position,
      velocity,
      onGround: sv.onGround,
      squawk: sv.squawk ?? undefined,
      source: "opensky",
    };
  }

  private async fetch(url: string): Promise<OpenSkyResponse> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.authHeader) {
      headers["Authorization"] = this.authHeader;
    }

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(
        `OpenSky API error: ${response.status} ${response.statusText}`,
      );
    }

    return response.json() as Promise<OpenSkyResponse>;
  }
}
