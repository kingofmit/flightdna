import { describe, it, expect, beforeEach } from "vitest";
import { WindModel } from "../wind-model";
import type { Wind } from "../types";

describe("WindModel", () => {
  let model: WindModel;

  const surfaceWind: Wind = {
    speed: 10, // 10 m/s
    direction: 270, // from the west
    northComponent: 0,
    eastComponent: -10, // blowing eastward (from west)
  };

  beforeEach(() => {
    model = new WindModel();
  });

  describe("estimateAtAltitude", () => {
    it("wind at 10m AGL should approximately equal surface wind speed", () => {
      const result = model.estimateAtAltitude(surfaceWind, 10, 0);
      // At 10m (reference height), speed ratio should be ~1.0
      expect(result.speed).toBeCloseTo(surfaceWind.speed, 0);
    });

    it("wind at 1000m should be faster than surface wind", () => {
      const result = model.estimateAtAltitude(surfaceWind, 1000, 0);
      expect(result.speed).toBeGreaterThan(surfaceWind.speed);
    });

    it("wind at 5000m (above BL) should be ~1.5-2x surface", () => {
      const result = model.estimateAtAltitude(surfaceWind, 5000, 0);
      expect(result.speed).toBeGreaterThan(surfaceWind.speed * 1.4);
      expect(result.speed).toBeLessThan(surfaceWind.speed * 2.5);
    });

    it("direction should veer with altitude (up to ~20 degrees)", () => {
      // At top of boundary layer (~1500m), expect ~20° veer
      const atBL = model.estimateAtAltitude(surfaceWind, 1500, 0);
      const veer = (atBL.direction - surfaceWind.direction + 360) % 360;
      expect(veer).toBeGreaterThan(15);
      expect(veer).toBeLessThanOrEqual(20);

      // Above BL, direction should stabilize at ~20° offset
      const aboveBL = model.estimateAtAltitude(surfaceWind, 5000, 0);
      const veerAbove =
        (aboveBL.direction - surfaceWind.direction + 360) % 360;
      expect(veerAbove).toBeCloseTo(20, 0);
    });

    it("should account for surface elevation", () => {
      // If station is at 500m MSL, requesting wind at 600m MSL = 100m AGL
      const result = model.estimateAtAltitude(surfaceWind, 600, 500);
      // 100m AGL should give a modest speed increase over surface
      expect(result.speed).toBeGreaterThan(surfaceWind.speed);
      // But less than at 600m AGL (no elevation offset)
      const noElevation = model.estimateAtAltitude(surfaceWind, 600, 0);
      expect(result.speed).toBeLessThan(noElevation.speed);
    });

    it("should clamp AGL to minimum of 10m", () => {
      // Target altitude below surface elevation
      const result = model.estimateAtAltitude(surfaceWind, 0, 100);
      // AGL clamped to 10m, should roughly equal surface wind
      expect(result.speed).toBeCloseTo(surfaceWind.speed, 0);
    });

    it("north/east components should be consistent with speed and direction", () => {
      const result = model.estimateAtAltitude(surfaceWind, 3000, 0);
      const dirRad = (result.direction * Math.PI) / 180;
      const expectedN = -result.speed * Math.cos(dirRad);
      const expectedE = -result.speed * Math.sin(dirRad);
      expect(result.northComponent).toBeCloseTo(expectedN, 6);
      expect(result.eastComponent).toBeCloseTo(expectedE, 6);
    });

    it("should return zero wind for NaN surface speed", () => {
      const nanWind: Wind = {
        speed: NaN,
        direction: 270,
        northComponent: 0,
        eastComponent: NaN,
      };
      const result = model.estimateAtAltitude(nanWind, 5000, 0);
      expect(result.speed).toBe(0);
      expect(result.direction).toBe(0);
      expect(result.northComponent).toBe(0);
      expect(result.eastComponent).toBe(0);
    });

    it("should return zero wind for negative surface speed", () => {
      const negWind: Wind = {
        speed: -5,
        direction: 270,
        northComponent: 0,
        eastComponent: 5,
      };
      const result = model.estimateAtAltitude(negWind, 5000, 0);
      expect(result.speed).toBe(0);
    });

    it("should return zero wind for Infinity surface speed", () => {
      const infWind: Wind = {
        speed: Infinity,
        direction: 270,
        northComponent: 0,
        eastComponent: -Infinity,
      };
      const result = model.estimateAtAltitude(infWind, 5000, 0);
      expect(result.speed).toBe(0);
    });

    it("should clamp speed ratio at very high altitudes", () => {
      const result = model.estimateAtAltitude(surfaceWind, 50_000, 0);
      // With clamping, speed should not exceed 4x surface wind
      // (blSpeedRatio * 4 is the theoretical max)
      expect(result.speed).toBeLessThan(surfaceWind.speed * 20);
      expect(Number.isFinite(result.speed)).toBe(true);
    });
  });

  describe("computeTAS", () => {
    it("with zero wind, TAS should equal ground speed", () => {
      const calmWind: Wind = {
        speed: 0,
        direction: 0,
        northComponent: 0,
        eastComponent: 0,
      };
      const result = model.computeTAS(250, 90, calmWind);
      expect(result.trueAirspeed).toBeCloseTo(250, 1);
    });

    it("with headwind, TAS should be greater than ground speed", () => {
      // Aircraft flying north (track=0), wind from north (direction=0)
      // Wind from north means air moves southward: northComponent = -speed
      const headWind: Wind = {
        speed: 20,
        direction: 0, // from north
        northComponent: -20,
        eastComponent: 0,
      };
      const result = model.computeTAS(250, 0, headWind);
      // TAS_N = GS_N - windN = 250 - (-20) = 270
      expect(result.trueAirspeed).toBeGreaterThan(250);
      expect(result.trueAirspeed).toBeCloseTo(270, 1);
    });

    it("with tailwind, TAS should be less than ground speed", () => {
      // Aircraft flying north (track=0), wind from south (direction=180)
      // Wind from south means air moves northward: northComponent = +speed
      const tailWind: Wind = {
        speed: 20,
        direction: 180, // from south
        northComponent: 20,
        eastComponent: 0,
      };
      const result = model.computeTAS(250, 0, tailWind);
      // TAS_N = GS_N - windN = 250 - 20 = 230
      expect(result.trueAirspeed).toBeLessThan(250);
      expect(result.trueAirspeed).toBeCloseTo(230, 1);
    });

    it("should return zeros for NaN ground speed", () => {
      const result = model.computeTAS(NaN, 0, surfaceWind);
      expect(result.trueAirspeed).toBe(0);
      expect(result.heading).toBe(0);
    });

    it("should return zeros for negative ground speed", () => {
      const result = model.computeTAS(-100, 0, surfaceWind);
      expect(result.trueAirspeed).toBe(0);
      expect(result.heading).toBe(0);
    });

    it("heading should be in range [0, 360)", () => {
      const crossWind: Wind = {
        speed: 15,
        direction: 90, // from east
        northComponent: 0,
        eastComponent: -15,
      };
      const result = model.computeTAS(200, 0, crossWind);
      expect(result.heading).toBeGreaterThanOrEqual(0);
      expect(result.heading).toBeLessThan(360);
    });
  });
});
