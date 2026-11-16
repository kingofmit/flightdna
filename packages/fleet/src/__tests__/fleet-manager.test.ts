import { describe, it, expect, beforeEach } from "vitest";
import type { FlightState } from "@flightdna/core";
import { FleetManager } from "../fleet-manager";
import { findAirport, findNearestAirport, getAllAirports } from "../airport-db";

function makeState(overrides: Partial<FlightState> & { icao24: string }): FlightState {
  return {
    aircraft: { icao24: overrides.icao24, callsign: overrides.aircraft?.callsign },
    timestamp: overrides.timestamp ?? Date.now(),
    position: {
      latitude: 52.0,
      longitude: 4.0,
      altitude: 10000,
      ...overrides.position,
    },
    velocity: {
      groundSpeed: 230,
      track: 90,
      verticalRate: 0,
      ...overrides.velocity,
    },
    onGround: overrides.onGround ?? false,
    source: "test",
  };
}

describe("FleetManager", () => {
  let fleet: FleetManager;

  beforeEach(() => {
    fleet = new FleetManager("test-fleet");
  });

  describe("fleet management", () => {
    it("should add aircraft", () => {
      fleet.addAircraft("abc123");
      expect(fleet.size).toBe(1);
      expect(fleet.getAircraft("abc123")).toBeDefined();
    });

    it("should not add duplicates", () => {
      fleet.addAircraft("abc123");
      fleet.addAircraft("abc123");
      expect(fleet.size).toBe(1);
    });

    it("should normalize ICAO24 to lowercase", () => {
      fleet.addAircraft("ABC123");
      expect(fleet.getAircraft("abc123")).toBeDefined();
    });

    it("should remove aircraft", () => {
      fleet.addAircraft("abc123");
      const removed = fleet.removeAircraft("abc123");
      expect(removed).toBe(true);
      expect(fleet.size).toBe(0);
    });

    it("should return false when removing non-existent aircraft", () => {
      expect(fleet.removeAircraft("xyz")).toBe(false);
    });

    it("should get all aircraft", () => {
      fleet.addAircraft("a1");
      fleet.addAircraft("a2");
      fleet.addAircraft("a3");
      expect(fleet.getAllAircraft()).toHaveLength(3);
    });

    it("should store metadata", () => {
      fleet.addAircraft("abc123", { callsign: "UAL123", typeDesignator: "B738" });
      const entry = fleet.getAircraft("abc123");
      expect(entry?.aircraft.callsign).toBe("UAL123");
      expect(entry?.aircraft.typeDesignator).toBe("B738");
    });

    it("should store tags", () => {
      fleet.addAircraft("abc123", {}, ["hub-SFO", "narrowbody"]);
      const entry = fleet.getAircraft("abc123");
      expect(entry?.tags).toContain("hub-SFO");
      expect(entry?.tags).toContain("narrowbody");
    });

    it("should clear all aircraft", () => {
      fleet.addAircraft("a1");
      fleet.addAircraft("a2");
      fleet.clear();
      expect(fleet.size).toBe(0);
    });
  });

  describe("state updates", () => {
    it("should update twin for tracked aircraft", () => {
      fleet.addAircraft("abc123");
      fleet.update(makeState({ icao24: "abc123" }));
      const twin = fleet.getTwin("abc123");
      expect(twin?.isInitialized).toBe(true);
    });

    it("should ignore updates for untracked aircraft", () => {
      fleet.update(makeState({ icao24: "unknown" }));
      expect(fleet.getTwin("unknown")).toBeUndefined();
    });

    it("should update twinState on fleet aircraft entry", () => {
      fleet.addAircraft("abc123");
      fleet.update(makeState({ icao24: "abc123" }));
      const entry = fleet.getAircraft("abc123");
      expect(entry?.twinState).toBeDefined();
      expect(entry?.twinState?.icao24).toBe("abc123");
    });
  });

  describe("analytics", () => {
    it("should return basic analytics", () => {
      fleet.addAircraft("a1");
      fleet.addAircraft("a2");
      const analytics = fleet.getAnalytics();
      expect(analytics.aircraftCount).toBe(2);
      expect(analytics.timestamp).toBeGreaterThan(0);
    });

    it("should count airborne aircraft", () => {
      fleet.addAircraft("a1");
      fleet.addAircraft("a2");
      fleet.update(makeState({ icao24: "a1", onGround: false }));
      fleet.update(makeState({ icao24: "a2", onGround: false }));
      const analytics = fleet.getAnalytics();
      expect(analytics.airborneCount).toBe(2);
    });
  });

  describe("comparison", () => {
    it("should compare two aircraft", () => {
      fleet.addAircraft("a1");
      fleet.addAircraft("a2");
      fleet.update(makeState({ icao24: "a1" }));
      fleet.update(makeState({ icao24: "a2" }));
      const comparison = fleet.compare("a1", "a2");
      expect(comparison).toBeDefined();
      expect(comparison!.icao24A).toBe("a1");
      expect(comparison!.icao24B).toBe("a2");
    });

    it("should return null when comparing uninitialized aircraft", () => {
      fleet.addAircraft("a1");
      fleet.addAircraft("a2");
      expect(fleet.compare("a1", "a2")).toBeNull();
    });
  });

  it("should have correct name", () => {
    expect(fleet.name).toBe("test-fleet");
  });

  describe("type baseline", () => {
    it("should return null with fewer than 3 aircraft of same type", () => {
      fleet.addAircraft("a1", { typeDesignator: "B738" });
      fleet.addAircraft("a2", { typeDesignator: "B738" });
      fleet.update(makeState({ icao24: "a1" }));
      fleet.update(makeState({ icao24: "a2" }));
      expect(fleet.getTypeBaseline("B738")).toBeNull();
    });

    it("should return valid baseline with 3+ aircraft", () => {
      fleet.addAircraft("a1", { typeDesignator: "B738" });
      fleet.addAircraft("a2", { typeDesignator: "B738" });
      fleet.addAircraft("a3", { typeDesignator: "B738" });
      fleet.update(makeState({ icao24: "a1" }));
      fleet.update(makeState({ icao24: "a2" }));
      fleet.update(makeState({ icao24: "a3" }));

      const baseline = fleet.getTypeBaseline("B738");
      expect(baseline).not.toBeNull();
      expect(baseline!.typeDesignator).toBe("B738");
      expect(baseline!.sampleSize).toBe(3);
      expect(baseline!.climbRate.mean).toBeDefined();
      expect(baseline!.climbRate.stddev).toBeDefined();
      expect(baseline!.cruiseMach.mean).toBeDefined();
      expect(baseline!.cruiseMach.stddev).toBeDefined();
      expect(baseline!.healthScore.mean).toBeDefined();
      expect(baseline!.healthScore.stddev).toBeDefined();
    });
  });

  describe("degrading aircraft", () => {
    it("should return empty array when no degradation", () => {
      fleet.addAircraft("a1");
      fleet.update(makeState({ icao24: "a1" }));
      const degrading = fleet.getDegradingAircraft();
      expect(degrading).toEqual([]);
    });
  });

  describe("airport database", () => {
    it("should lookup airport by ICAO code", () => {
      const jfk = findAirport("KJFK");
      expect(jfk).toBeDefined();
      expect(jfk!.iata).toBe("JFK");
      expect(jfk!.name).toContain("Kennedy");
    });

    it("should return undefined for unknown ICAO code", () => {
      expect(findAirport("ZZZZ")).toBeUndefined();
    });

    it("should find nearest airport near JFK coordinates", () => {
      // Position very close to JFK
      const airport = findNearestAirport(40.64, -73.78);
      expect(airport).toBeDefined();
      expect(airport!.icao).toBe("KJFK");
    });

    it("should return undefined for middle of ocean", () => {
      // Middle of the Pacific Ocean
      const airport = findNearestAirport(0, -160);
      expect(airport).toBeUndefined();
    });

    it("should contain at least 200 airports", () => {
      const airports = getAllAirports();
      expect(airports.length).toBeGreaterThanOrEqual(200);
    });
  });
});
