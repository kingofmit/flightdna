import { describe, it, expect } from "vitest";
import { getAircraftType, getAllAircraftTypes, getAircraftConfig } from "../aircraft-db";

describe("Aircraft Database", () => {
  it("should contain at least 40 aircraft types", () => {
    const all = getAllAircraftTypes();
    expect(all.length).toBeGreaterThanOrEqual(40);
  });

  describe("lookup by type designator", () => {
    it("should find B738", () => {
      const b738 = getAircraftType("B738");
      expect(b738).toBeDefined();
      expect(b738!.name).toContain("737");
      expect(b738!.wingArea).toBeGreaterThan(100);
      expect(b738!.wingArea).toBeLessThan(150);
      expect(b738!.wingSpan).toBeGreaterThan(30);
      expect(b738!.mtow).toBeGreaterThan(70000);
      expect(b738!.engineCount).toBe(2);
    });

    it("should find A320", () => {
      const a320 = getAircraftType("A320");
      expect(a320).toBeDefined();
      expect(a320!.wingArea).toBeGreaterThan(100);
      expect(a320!.wingSpan).toBeGreaterThan(30);
      expect(a320!.engineCount).toBe(2);
    });

    it("should find B77W (widebody)", () => {
      const b77w = getAircraftType("B77W");
      expect(b77w).toBeDefined();
      expect(b77w!.category).toBe("widebody");
      expect(b77w!.mtow).toBeGreaterThan(300000);
      expect(b77w!.wingSpan).toBeGreaterThan(60);
    });

    it("should be case-insensitive", () => {
      expect(getAircraftType("b738")).toEqual(getAircraftType("B738"));
    });

    it("should return undefined for unknown types", () => {
      expect(getAircraftType("XXXX")).toBeUndefined();
    });
  });

  describe("aerodynamic estimates", () => {
    it("should have reasonable CD0 for narrowbodies (0.018-0.030)", () => {
      const b738 = getAircraftType("B738")!;
      expect(b738.cd0Estimate).toBeGreaterThan(0.018);
      expect(b738.cd0Estimate).toBeLessThan(0.030);
    });

    it("should have reasonable k for jets (0.030-0.060)", () => {
      const b738 = getAircraftType("B738")!;
      expect(b738.kEstimate).toBeGreaterThan(0.030);
      expect(b738.kEstimate).toBeLessThan(0.060);
    });

    it("should have consistent Oswald efficiency (0.7-0.9)", () => {
      const b738 = getAircraftType("B738")!;
      const AR = b738.wingSpan ** 2 / b738.wingArea;
      const e = 1 / (Math.PI * b738.kEstimate * AR);
      expect(e).toBeGreaterThan(0.7);
      expect(e).toBeLessThan(0.9);
    });
  });

  describe("getAircraftConfig", () => {
    it("should return AircraftConfig for known type", () => {
      const config = getAircraftConfig("B738");
      expect(config).toBeDefined();
      expect(config!.wingArea).toBeGreaterThan(100);
      expect(config!.wingSpan).toBeGreaterThan(30);
      expect(config!.mass).toBeGreaterThan(40000);
    });

    it("should use mid-range mass estimate when no mass provided", () => {
      const data = getAircraftType("B738")!;
      const config = getAircraftConfig("B738")!;
      const expectedMass = (data.mtow + data.oew) / 2;
      expect(config.mass).toBe(expectedMass);
    });

    it("should use provided estimated mass", () => {
      const config = getAircraftConfig("B738", 65000)!;
      expect(config.mass).toBe(65000);
    });

    it("should return undefined for unknown type", () => {
      expect(getAircraftConfig("XXXX")).toBeUndefined();
    });
  });
});
