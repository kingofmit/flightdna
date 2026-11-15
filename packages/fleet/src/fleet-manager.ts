import type { Aircraft, FlightState } from "@flightdna/core";
import { DigitalTwin } from "@flightdna/twin";
import type {
  AircraftComparison,
  Fleet,
  FleetAircraft,
  FleetAnalytics,
  RouteStats,
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

  constructor(name: string = "default") {
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
    return this.fleet.aircraft.delete(normalized);
  }

  /**
   * Feed a flight state update for any aircraft in the fleet.
   */
  update(state: FlightState): void {
    const icao24 = state.aircraft.icao24.toLowerCase();
    const twin = this.twins.get(icao24);
    if (!twin) return;

    twin.update(state);

    // Update twin state reference
    const entry = this.fleet.aircraft.get(icao24);
    if (entry) {
      entry.twinState = twin.getState();
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
   * Remove all aircraft and reset the fleet.
   */
  clear(): void {
    this.fleet.aircraft.clear();
    this.twins.clear();
    this.routes.clear();
  }
}
