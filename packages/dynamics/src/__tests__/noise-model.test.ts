import { describe, it, expect } from "vitest";
import { NoiseModel } from "../noise-model";
import type { NoiseSourceParams } from "../noise-model";
import type { Position } from "@flightdna/core";

describe("NoiseModel", () => {
  const model = new NoiseModel();

  // Typical B738 params
  const b738Params: NoiseSourceParams = {
    referenceSEL: 92,
    engineCount: 2,
    engineType: "turbofan",
    category: "large",
  };

  // Aircraft at ~1000ft AGL over an observer
  const aircraftAt1000ft: Position = {
    latitude: 40.0,
    longitude: -74.0,
    altitude: 304.8, // 1000 ft
  };

  const groundObserver: Position = {
    latitude: 40.0,
    longitude: -74.0,
    altitude: 0,
  };

  const typicalSpeed = 82; // ~160 knots in m/s

  describe("estimateNoise", () => {
    it("should return SEL close to reference value at reference distance (305m)", () => {
      // Observer directly below at ground level, aircraft at 304.8m
      const result = model.estimateNoise(
        aircraftAt1000ft,
        typicalSpeed,
        b738Params,
        groundObserver,
      );

      // At reference distance, the base SEL should be close to reference
      // (some adjustments apply: engine count, ground reflection, speed)
      expect(result.sel).toBeGreaterThan(80);
      expect(result.sel).toBeLessThan(105);
      expect(result.slantDistance).toBeCloseTo(305, -1);
    });

    it("should decrease noise with distance (further = quieter)", () => {
      const nearObserver: Position = {
        latitude: 40.001,
        longitude: -74.0,
        altitude: 0,
      };
      const farObserver: Position = {
        latitude: 40.01,
        longitude: -74.0,
        altitude: 0,
      };

      const nearResult = model.estimateNoise(
        aircraftAt1000ft,
        typicalSpeed,
        b738Params,
        nearObserver,
      );
      const farResult = model.estimateNoise(
        aircraftAt1000ft,
        typicalSpeed,
        b738Params,
        farObserver,
      );

      expect(nearResult.sel).toBeGreaterThan(farResult.sel);
      expect(nearResult.lmax).toBeGreaterThan(farResult.lmax);
      expect(nearResult.slantDistance).toBeLessThan(farResult.slantDistance);
    });

    it("should decrease noise with altitude (higher = quieter)", () => {
      const lowAircraft: Position = {
        latitude: 40.0,
        longitude: -74.0,
        altitude: 300,
      };
      const highAircraft: Position = {
        latitude: 40.0,
        longitude: -74.0,
        altitude: 3000,
      };

      const lowResult = model.estimateNoise(
        lowAircraft,
        typicalSpeed,
        b738Params,
        groundObserver,
      );
      const highResult = model.estimateNoise(
        highAircraft,
        typicalSpeed,
        b738Params,
        groundObserver,
      );

      expect(lowResult.sel).toBeGreaterThan(highResult.sel);
    });

    it("should produce louder noise for heavy aircraft (B77W) than small (CRJ9)", () => {
      const heavyParams = NoiseModel.getDefaultParams("B77W")!;
      const smallParams = NoiseModel.getDefaultParams("CRJ9")!;

      const heavyResult = model.estimateNoise(
        aircraftAt1000ft,
        typicalSpeed,
        heavyParams,
        groundObserver,
      );
      const smallResult = model.estimateNoise(
        aircraftAt1000ft,
        typicalSpeed,
        smallParams,
        groundObserver,
      );

      expect(heavyResult.sel).toBeGreaterThan(smallResult.sel);
    });

    it("should not crash for zero/negative slant distance", () => {
      // Observer at same position as aircraft
      const samePosition: Position = {
        latitude: 40.0,
        longitude: -74.0,
        altitude: 304.8,
      };

      const result = model.estimateNoise(
        aircraftAt1000ft,
        typicalSpeed,
        b738Params,
        samePosition,
      );

      expect(result.sel).toBe(120);
      expect(result.lmax).toBe(120);
      expect(result.slantDistance).toBe(1);
    });

    it("should return non-negative values for all noise metrics", () => {
      // Very far observer where noise should be low
      const farObserver: Position = {
        latitude: 41.0,
        longitude: -74.0,
        altitude: 0,
      };

      const result = model.estimateNoise(
        aircraftAt1000ft,
        typicalSpeed,
        b738Params,
        farObserver,
      );

      expect(result.sel).toBeGreaterThanOrEqual(0);
      expect(result.lmax).toBeGreaterThanOrEqual(0);
      expect(result.epnl).toBeGreaterThanOrEqual(0);
    });

    it("should include EPNL that reflects engine type tonal correction", () => {
      const turbofanParams: NoiseSourceParams = {
        referenceSEL: 90,
        engineCount: 2,
        engineType: "turbofan",
        category: "large",
      };
      const pistonParams: NoiseSourceParams = {
        referenceSEL: 90,
        engineCount: 2,
        engineType: "piston",
        category: "small",
      };

      const turbofanResult = model.estimateNoise(
        aircraftAt1000ft,
        typicalSpeed,
        turbofanParams,
        groundObserver,
      );
      const pistonResult = model.estimateNoise(
        aircraftAt1000ft,
        typicalSpeed,
        pistonParams,
        groundObserver,
      );

      // Turbofan tonal correction is higher than piston
      expect(turbofanResult.epnl).toBeGreaterThan(pistonResult.epnl);
    });
  });

  describe("getDefaultParams", () => {
    it("should return valid params for known types", () => {
      const knownTypes = [
        "B738",
        "A320",
        "B77W",
        "A388",
        "CRJ9",
        "AT76",
        "C172",
      ];
      for (const type of knownTypes) {
        const params = NoiseModel.getDefaultParams(type);
        expect(params).not.toBeNull();
        expect(params!.referenceSEL).toBeGreaterThan(0);
        expect(params!.engineCount).toBeGreaterThanOrEqual(1);
        expect(["turbofan", "turboprop", "piston"]).toContain(
          params!.engineType,
        );
        expect(["heavy", "large", "small"]).toContain(params!.category);
      }
    });

    it("should return null for unknown type", () => {
      expect(NoiseModel.getDefaultParams("ZZZZ")).toBeNull();
      expect(NoiseModel.getDefaultParams("UNKNOWN")).toBeNull();
    });

    it("should be case-insensitive", () => {
      expect(NoiseModel.getDefaultParams("b738")).toEqual(
        NoiseModel.getDefaultParams("B738"),
      );
    });
  });

  describe("computeContour", () => {
    const aircraftAbove: Position = {
      latitude: 40.0,
      longitude: -74.0,
      altitude: 500,
    };

    it("should form a closed shape (first and last points near each other in angle)", () => {
      const contour = model.computeContour(
        aircraftAbove,
        typicalSpeed,
        b738Params,
        80, // 80 dBA target
        36,
      );

      expect(contour.length).toBe(36);

      // First and last points should be adjacent in angle (10 degrees apart for 36 points)
      // They should be at roughly the same distance from the center
      const firstDLat = contour[0].latitude - aircraftAbove.latitude;
      const firstDLon = contour[0].longitude - aircraftAbove.longitude;
      const lastDLat =
        contour[contour.length - 1].latitude - aircraftAbove.latitude;
      const lastDLon =
        contour[contour.length - 1].longitude - aircraftAbove.longitude;

      const firstRadius = Math.sqrt(firstDLat ** 2 + firstDLon ** 2);
      const lastRadius = Math.sqrt(lastDLat ** 2 + lastDLon ** 2);

      // Radii should be approximately equal (circular contour)
      // Tolerance is loose because lat/lon scaling differs
      expect(firstRadius).toBeCloseTo(lastRadius, 2);
    });

    it("should produce a smaller contour for higher target SEL (louder = smaller contour)", () => {
      const contourQuiet = model.computeContour(
        aircraftAbove,
        typicalSpeed,
        b738Params,
        70, // quieter threshold = larger area
        36,
      );
      const contourLoud = model.computeContour(
        aircraftAbove,
        typicalSpeed,
        b738Params,
        90, // louder threshold = smaller area
        36,
      );

      // Compute average radius for each contour
      const avgRadiusQuiet =
        contourQuiet.reduce(
          (sum, p) =>
            sum +
            Math.sqrt(
              (p.latitude - aircraftAbove.latitude) ** 2 +
                (p.longitude - aircraftAbove.longitude) ** 2,
            ),
          0,
        ) / contourQuiet.length;

      const avgRadiusLoud =
        contourLoud.reduce(
          (sum, p) =>
            sum +
            Math.sqrt(
              (p.latitude - aircraftAbove.latitude) ** 2 +
                (p.longitude - aircraftAbove.longitude) ** 2,
            ),
          0,
        ) / contourLoud.length;

      expect(avgRadiusQuiet).toBeGreaterThan(avgRadiusLoud);
    });

    it("should return the requested number of points", () => {
      const contour = model.computeContour(
        aircraftAbove,
        typicalSpeed,
        b738Params,
        80,
        12,
      );
      expect(contour.length).toBe(12);
    });
  });
});
