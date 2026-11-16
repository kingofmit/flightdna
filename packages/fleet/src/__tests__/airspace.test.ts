import { describe, it, expect } from "vitest";
import {
  getAirspaceAtPosition,
  getAirspaceClass,
  isRestricted,
  getAllAirspaceZones,
} from "../airspace";
import type { Position } from "@flightdna/core";

function pos(latitude: number, longitude: number, altitude: number): Position {
  return { latitude, longitude, altitude };
}

describe("airspace", () => {
  describe("getAirspaceAtPosition", () => {
    it("should find controlled airspace at KJFK", () => {
      const zones = getAirspaceAtPosition(pos(40.64, -73.78, 500));
      expect(zones.length).toBeGreaterThan(0);
      const ids = zones.map((z) => z.id);
      // Should be in the New York TMA and/or JFK CTR
      expect(
        ids.some((id) => id.includes("KZNY") || id.includes("KJFK")),
      ).toBe(true);
    });

    it("should return empty for mid-Pacific at cruise altitude", () => {
      // Middle of the Pacific, far from any zone
      const zones = getAirspaceAtPosition(pos(0.0, -160.0, 10_000));
      expect(zones.length).toBe(0);
    });

    it("should find London TMA at high altitude over London", () => {
      // Position over central London at ~5000m (within TMA upper limit of 7620m)
      const zones = getAirspaceAtPosition(pos(51.47, -0.45, 5000));
      const tma = zones.find((z) => z.id === "EGTT-TMA");
      expect(tma).toBeDefined();
      expect(tma!.name).toBe("London TMA");
    });
  });

  describe("getAirspaceClass", () => {
    it("should return Class B at KJFK", () => {
      const cls = getAirspaceClass(pos(40.64, -73.78, 500));
      // New York TMA is B, JFK CTR is B — most restrictive is B
      expect(cls).toBe("B");
    });

    it("should return Class G in mid-Pacific", () => {
      const cls = getAirspaceClass(pos(0.0, -160.0, 10_000));
      expect(cls).toBe("G");
    });

    it("should return Class A over London TMA at altitude", () => {
      const cls = getAirspaceClass(pos(51.47, -0.45, 5000));
      // London TMA is Class A
      expect(cls).toBe("A");
    });
  });

  describe("isRestricted", () => {
    it("should return true near Washington DC ADIZ", () => {
      // Position near the White House at low altitude
      const result = isRestricted(pos(38.90, -77.04, 300));
      expect(result).toBe(true);
    });

    it("should return true in P-56 prohibited zone", () => {
      const result = isRestricted(pos(38.8977, -77.0365, 100));
      expect(result).toBe(true);
    });

    it("should return false at a normal airport", () => {
      // LAX — controlled but not restricted
      const result = isRestricted(pos(33.94, -118.41, 500));
      expect(result).toBe(false);
    });

    it("should return true in North Korea restricted airspace", () => {
      const result = isRestricted(pos(39.04, 125.76, 10_000));
      expect(result).toBe(true);
    });
  });

  describe("getAllAirspaceZones", () => {
    it("should return 50+ zones", () => {
      const zones = getAllAirspaceZones();
      expect(zones.length).toBeGreaterThanOrEqual(50);
    });

    it("should return a defensive copy", () => {
      const a = getAllAirspaceZones();
      const b = getAllAirspaceZones();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it("should have valid zone data", () => {
      const zones = getAllAirspaceZones();
      for (const z of zones) {
        expect(z.id).toBeTruthy();
        expect(z.name).toBeTruthy();
        expect(z.radius).toBeGreaterThan(0);
        expect(z.centerLat).toBeGreaterThanOrEqual(-90);
        expect(z.centerLat).toBeLessThanOrEqual(90);
        expect(z.centerLon).toBeGreaterThanOrEqual(-180);
        expect(z.centerLon).toBeLessThanOrEqual(180);
        expect(z.country).toHaveLength(2);
      }
    });
  });
});
