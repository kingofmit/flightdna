import type { Aircraft, FlightState } from "@flightdna/core";
import { DigitalTwin } from "@flightdna/twin";
import type { Airport } from "./airport-db";
import { findNearestAirport } from "./airport-db";
import type {
  AircraftComparison,
  AircraftScore,
  Fleet,
  FleetAircraft,
  FleetAnalytics,
  RouteStats,
  TypeBaseline,
} from "./types";

/**
 * FleetManager — track and analyze multiple aircraft simultaneously.
 *
 * Maintains digital twins for each aircraft in the fleet and provides
 * fleet-wide analytics, comparative analysis, and route statistics.
 */
export class FleetManager {
  private readonly fleet: Fleet;
  private readonly twins = new Map<string, DigitalTwin>();
  private readonly routes = new Map<string, RouteStats>();
  private readonly routeHistory = new Map<string, {
    airports: Array<{ airport: Airport; timestamp: number; type: "departure" | "arrival" }>;
  }>();
  private readonly maxFleetSize: number;

  /** Inactivity timeout for stale aircraft eviction in ms (default: 30 minutes). */
  private readonly staleTimeout: number;

  constructor(
    name: string = "default",
    options: { maxFleetSize?: number; staleTimeout?: number } = {},
  ) {
    this.maxFleetSize = options.maxFleetSize ?? 10_000;
    this.staleTimeout = options.staleTimeout ?? 1_800_000;
    this.fleet = {
      name,
      aircraft: new Map(),
      createdAt: Date.now(),
    };
  }

  /**
   * Add an aircraft to the fleet.
   */
  addAircraft(
    icao24: string,
    metadata: Partial<Aircraft> = {},
    tags: string[] = [],
  ): void {
    const normalized = icao24.toLowerCase();
    if (this.fleet.aircraft.has(normalized)) return;

    if (this.fleet.aircraft.size >= this.maxFleetSize) {
      return; // Silently reject — fleet is at capacity
    }

    const aircraft: Aircraft = {
      icao24: normalized,
      ...metadata,
    };

    this.fleet.aircraft.set(normalized, {
      aircraft,
      addedAt: Date.now(),
      tags,
    });

    this.twins.set(
      normalized,
      new DigitalTwin({ icao24: normalized }),
    );
  }

  /**
   * Remove an aircraft from the fleet.
   */
  removeAircraft(icao24: string): boolean {
    const normalized = icao24.toLowerCase();
    this.twins.delete(normalized);
    this.routeHistory.delete(normalized);
    return this.fleet.aircraft.delete(normalized);
  }

  /**
   * Feed a flight state update for any aircraft in the fleet.
   */
  update(state: FlightState): void {
    const icao24 = state.aircraft.icao24.toLowerCase();
    const twin = this.twins.get(icao24);
    if (!twin) return;

    // Track previous airborne state for route detection
    const wasAirborne = twin.isInitialized && twin.getState().airborne;

    twin.update(state);

    // Update twin state reference
    const entry = this.fleet.aircraft.get(icao24);
    if (entry) {
      entry.twinState = twin.getState();
    }

    // Route detection: track airport proximity transitions
    this.updateRouteDetection(icao24, state, wasAirborne);
  }

  private updateRouteDetection(
    icao24: string,
    state: FlightState,
    wasAirborne: boolean,
  ): void {
    const isLowAndSlow =
      state.position.altitude < 500 && state.velocity.groundSpeed < 50;

    if (!this.routeHistory.has(icao24)) {
      this.routeHistory.set(icao24, { airports: [] });
    }
    const history = this.routeHistory.get(icao24)!;

    if (isLowAndSlow) {
      const airport = findNearestAirport(
        state.position.latitude,
        state.position.longitude,
      );
      if (airport) {
        // If we were airborne and now low/slow near airport -> arrival
        if (wasAirborne) {
          history.airports.push({
            airport,
            timestamp: state.timestamp,
            type: "arrival",
          });
        } else if (history.airports.length === 0) {
          // First detection while on ground -> departure point
          history.airports.push({
            airport,
            timestamp: state.timestamp,
            type: "departure",
          });
        }
      }
    }
  }

  /**
   * Get an aircraft entry from the fleet.
   */
  getAircraft(icao24: string): FleetAircraft | undefined {
    return this.fleet.aircraft.get(icao24.toLowerCase());
  }

  /**
   * Get the digital twin for an aircraft.
   */
  getTwin(icao24: string): DigitalTwin | undefined {
    return this.twins.get(icao24.toLowerCase());
  }

  /**
   * Get all aircraft in the fleet.
   */
  getAllAircraft(): FleetAircraft[] {
    return Array.from(this.fleet.aircraft.values());
  }

  /**
   * Get fleet-wide analytics.
   */
  getAnalytics(): FleetAnalytics {
    // Evict stale aircraft before computing analytics
    this.evictStaleAircraft();

    let airborneCount = 0;
    let totalHealth = 0;
    let healthCount = 0;
    let totalAnomalies = 0;
    let totalFlightHours = 0;
    const byType = new Map<string, { count: number; totalHealth: number }>();

    for (const [icao24, entry] of this.fleet.aircraft) {
      const twin = this.twins.get(icao24);
      if (!twin?.isInitialized) continue;

      const state = twin.getState();

      if (state.airborne) airborneCount++;
      totalAnomalies += state.anomalies.length;
      totalFlightHours += state.flightHours;

      // Overall health from health indicators
      const overall = state.health.find((h) => h.type === "overall");
      if (overall) {
        totalHealth += overall.value;
        healthCount++;
      }

      // By type
      const typeKey = entry.aircraft.typeDesignator ?? "unknown";
      const existing = byType.get(typeKey) ?? { count: 0, totalHealth: 0 };
      existing.count++;
      existing.totalHealth += overall?.value ?? 1;
      byType.set(typeKey, existing);
    }

    const byTypeResult = new Map<string, { count: number; avgHealth: number }>();
    for (const [type, data] of byType) {
      byTypeResult.set(type, {
        count: data.count,
        avgHealth: data.count > 0 ? data.totalHealth / data.count : 1,
      });
    }

    return {
      aircraftCount: this.fleet.aircraft.size,
      airborneCount,
      averageHealth: healthCount > 0 ? totalHealth / healthCount : 1,
      totalAnomalies,
      totalFlightHours,
      byType: byTypeResult,
      timestamp: Date.now(),
    };
  }

  /**
   * Compare two aircraft in the fleet.
   */
  compare(icao24A: string, icao24B: string): AircraftComparison | null {
    const twinA = this.twins.get(icao24A.toLowerCase());
    const twinB = this.twins.get(icao24B.toLowerCase());

    if (!twinA?.isInitialized || !twinB?.isInitialized) return null;

    const stateA = twinA.getState();
    const stateB = twinB.getState();

    const healthA = stateA.health.find((h) => h.type === "overall")?.value ?? 1;
    const healthB = stateB.health.find((h) => h.type === "overall")?.value ?? 1;

    return {
      icao24A: icao24A.toLowerCase(),
      icao24B: icao24B.toLowerCase(),
      healthDelta: healthA - healthB,
      flightHoursDelta: stateA.flightHours - stateB.flightHours,
      performance: {
        machDelta: stateA.performance.mach - stateB.performance.mach,
        climbRateDelta: stateA.performance.climbRate - stateB.performance.climbRate,
      },
      anomalyDelta: stateA.anomalies.length - stateB.anomalies.length,
    };
  }

  /**
   * Get fleet size.
   */
  get size(): number {
    return this.fleet.aircraft.size;
  }

  /**
   * Get the fleet name.
   */
  get name(): string {
    return this.fleet.name;
  }

  /**
   * Get type-level performance baselines computed from all aircraft of a given type.
   * Returns mean and stddev for key metrics.
   * Requires at least 3 aircraft of the same type to form a baseline.
   */
  getTypeBaseline(typeDesignator: string): TypeBaseline | null {
    const climbRates: number[] = [];
    const machValues: number[] = [];
    const healthValues: number[] = [];

    for (const [icao24, entry] of this.fleet.aircraft) {
      if (entry.aircraft.typeDesignator !== typeDesignator) continue;

      const twin = this.twins.get(icao24);
      if (!twin?.isInitialized) continue;

      const state = twin.getState();
      climbRates.push(state.performance.climbRate);
      machValues.push(state.performance.mach);

      const overall = state.health.find((h) => h.type === "overall");
      healthValues.push(overall?.value ?? 1);
    }

    if (climbRates.length < 3) return null;

    return {
      typeDesignator,
      sampleSize: climbRates.length,
      climbRate: computeStats(climbRates),
      cruiseMach: computeStats(machValues),
      healthScore: computeStats(healthValues),
    };
  }

  /**
   * Score an individual aircraft against its type baseline.
   * Returns a score 0-1 for each metric (1 = at or above average).
   */
  scoreAgainstBaseline(icao24: string): AircraftScore | null {
    const normalized = icao24.toLowerCase();
    const entry = this.fleet.aircraft.get(normalized);
    if (!entry) return null;

    const typeDesignator = entry.aircraft.typeDesignator;
    if (!typeDesignator) return null;

    const baseline = this.getTypeBaseline(typeDesignator);
    if (!baseline) return null;

    const twin = this.twins.get(normalized);
    if (!twin?.isInitialized) return null;

    const state = twin.getState();
    const overallHealth = state.health.find((h) => h.type === "overall")?.value ?? 1;

    const climbRateScore = computePercentile(
      state.performance.climbRate,
      baseline.climbRate.mean,
      baseline.climbRate.stddev,
    );
    const cruiseMachScore = computePercentile(
      state.performance.mach,
      baseline.cruiseMach.mean,
      baseline.cruiseMach.stddev,
    );
    const healthScore = computePercentile(
      overallHealth,
      baseline.healthScore.mean,
      baseline.healthScore.stddev,
    );

    const overallScore = (climbRateScore + cruiseMachScore + healthScore) / 3;

    return {
      icao24: normalized,
      typeDesignator,
      climbRateScore,
      cruiseMachScore,
      healthScore,
      overallScore,
    };
  }

  /**
   * Detect aircraft with degrading performance trends.
   * Returns aircraft whose health has dropped more than threshold over the observation window.
   */
  getDegradingAircraft(
    healthDropThreshold: number = 0.1,
  ): Array<{ icao24: string; healthDrop: number; indicator: string }> {
    const result: Array<{ icao24: string; healthDrop: number; indicator: string }> = [];

    for (const [icao24] of this.fleet.aircraft) {
      const twin = this.twins.get(icao24);
      if (!twin?.isInitialized) continue;

      const state = twin.getState();

      for (const indicator of state.health) {
        // A negative trend means degrading. Compare magnitude to threshold.
        if (indicator.trend < -healthDropThreshold) {
          result.push({
            icao24,
            healthDrop: Math.abs(indicator.trend),
            indicator: indicator.type,
          });
        }
      }
    }

    return result;
  }

  /**
   * Detect origin/destination airports for a tracked aircraft.
   * Uses accumulated route history from airport proximity events over time.
   * Departures are detected when an aircraft is first seen low/slow near an airport.
   * Arrivals are detected when an aircraft transitions from airborne to low/slow near an airport.
   */
  detectRoute(
    icao24: string,
  ): { origin: Airport | null; destination: Airport | null } | null {
    const normalized = icao24.toLowerCase();
    const history = this.routeHistory.get(normalized);
    if (!history || history.airports.length === 0) {
      return { origin: null, destination: null };
    }

    const departures = history.airports.filter((a) => a.type === "departure");
    const arrivals = history.airports.filter((a) => a.type === "arrival");

    return {
      origin: departures.length > 0 ? departures[0].airport : null,
      destination:
        arrivals.length > 0 ? arrivals[arrivals.length - 1].airport : null,
    };
  }

  /**
   * Evict aircraft whose twin has not been updated within the stale timeout.
   */
  private evictStaleAircraft(): void {
    const cutoff = Date.now() - this.staleTimeout;
    const toRemove: string[] = [];
    for (const [icao24] of this.fleet.aircraft) {
      const twin = this.twins.get(icao24);
      if (!twin?.isInitialized) continue;
      const state = twin.getState();
      if (state.timestamp < cutoff) {
        toRemove.push(icao24);
      }
    }
    for (const icao24 of toRemove) {
      this.removeAircraft(icao24);
    }
  }

  /**
   * Remove all aircraft and reset the fleet.
   */
  clear(): void {
    this.fleet.aircraft.clear();
    this.twins.clear();
    this.routes.clear();
    this.routeHistory.clear();
  }
}

// ── Helper functions ──────────────────────────────────────────────────────

function computeStats(values: number[]): { mean: number; stddev: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, stddev: 0 };
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  return { mean, stddev: Math.sqrt(variance) };
}

/**
 * Compute a 0-1 percentile-like score using CDF of normal distribution.
 * Returns the probability that a random sample from N(mean, stddev) is <= value.
 */
function computePercentile(
  value: number,
  mean: number,
  stddev: number,
): number {
  if (stddev === 0) {
    return value >= mean ? 1 : 0;
  }
  const z = (value - mean) / stddev;
  return normalCdf(z);
}

/**
 * Approximate cumulative distribution function of the standard normal distribution.
 * Uses the Abramowitz and Stegun approximation (error < 1.5e-7).
 */
function normalCdf(z: number): number {
  if (z < -6) return 0;
  if (z > 6) return 1;

  const sign = z < 0 ? -1 : 1;
  const absZ = Math.abs(z);

  const p = 0.2316419;
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;

  const t = 1 / (1 + p * absZ);
  const pdf = Math.exp(-0.5 * absZ * absZ) / Math.sqrt(2 * Math.PI);
  const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  const cdf = 1 - pdf * poly;

  return sign === 1 ? cdf : 1 - cdf;
}
