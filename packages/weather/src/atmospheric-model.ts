import type { Position } from "@flightdna/core";
import { ISACalculator } from "./isa";
import type { AtmosphericConditions, WeatherState, Wind } from "./types";

/**
 * Atmospheric model that combines ISA baseline with real weather observations.
 *
 * When real weather data is available, it adjusts the ISA model for
 * temperature deviation, wind, and non-standard pressure.
 */
export class AtmosphericModel {
  private readonly isa = new ISACalculator();
  private observations = new Map<
    string,
    { conditions: WeatherState; position: Position; timestamp: number }
  >();

  /**
   * Get atmospheric conditions at a position.
   * If real weather observations are available nearby, they are blended
   * with the ISA model. Otherwise, pure ISA is returned.
   */
  getConditions(position: Position): AtmosphericConditions {
    const isaConditions = this.isa.calculate(position.altitude);

    // Find nearest observation
    const nearest = this.findNearestObservation(position);
    if (!nearest) return isaConditions;

    // Adjust ISA based on observed temperature deviation
    const isaDeviation = this.isa.isaDeviation(
      position.altitude,
      nearest.conditions.atmosphere.temperature,
    );

    // Blend: apply temperature deviation to ISA
    const adjustedTemp = isaConditions.temperature + isaDeviation * 0.5;
    const adjustedDensity =
      isaConditions.pressure / (287.058 * adjustedTemp);

    return {
      ...isaConditions,
      temperature: adjustedTemp,
      density: adjustedDensity,
    };
  }

  /**
   * Get the wind at a position.
   * Returns ISA calm wind if no observations are available.
   */
  getWind(position: Position): Wind {
    const nearest = this.findNearestObservation(position);
    if (nearest) {
      return nearest.conditions.wind;
    }

    return {
      speed: 0,
      direction: 0,
      northComponent: 0,
      eastComponent: 0,
    };
  }

  /**
   * Get the complete weather state at a position.
   */
  getWeatherState(position: Position): WeatherState {
    return {
      atmosphere: this.getConditions(position),
      wind: this.getWind(position),
      timestamp: Date.now(),
    };
  }

  /**
   * Ingest a weather observation (e.g., from METAR).
   */
  addObservation(
    stationId: string,
    conditions: WeatherState,
    stationPosition: Position,
  ): void {
    this.observations.set(stationId, {
      conditions,
      position: stationPosition,
      timestamp: Date.now(),
    });
  }

  /**
   * Remove stale observations older than the given age in milliseconds.
   */
  pruneObservations(maxAgeMs: number = 7200_000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [key, obs] of this.observations) {
      if (obs.timestamp < cutoff) {
        this.observations.delete(key);
      }
    }
  }

  /**
   * Find the nearest weather observation to a position.
   */
  private findNearestObservation(
    position: Position,
  ):
    | { conditions: WeatherState; position: Position; timestamp: number }
    | null {
    let nearest: {
      conditions: WeatherState;
      position: Position;
      timestamp: number;
    } | null = null;
    let minDist = Infinity;

    for (const obs of this.observations.values()) {
      const dist = this.haversineDistance(position, obs.position);
      if (dist < minDist) {
        minDist = dist;
        nearest = obs;
      }
    }

    // Only use observations within 200 km
    if (nearest && minDist <= 200_000) {
      return nearest;
    }

    return null;
  }

  /**
   * Haversine distance between two positions in meters.
   */
  private haversineDistance(a: Position, b: Position): number {
    const R = 6_371_000; // Earth radius in meters
    const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
    const lat1 = (a.latitude * Math.PI) / 180;
    const lat2 = (b.latitude * Math.PI) / 180;

    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
}
