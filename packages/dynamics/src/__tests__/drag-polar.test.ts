import { describe, it, expect, beforeEach } from "vitest";
import { DragPolarEstimator } from "../drag-polar";

describe("DragPolarEstimator", () => {
  let estimator: DragPolarEstimator;

  beforeEach(() => {
    estimator = new DragPolarEstimator();
  });

  describe("OLS regression with synthetic data", () => {
    it("should estimate CD0 and k from clean synthetic data", () => {
      // CD = 0.020 + 0.045 * CL^2
      const trueCD0 = 0.02;
      const trueK = 0.045;

      for (let cl = 0.2; cl <= 1.2; cl += 0.1) {
        const cd = trueCD0 + trueK * cl * cl;
        estimator.addObservation({ cl, cd, mach: 0.78 });
      }

      const result = estimator.estimate(9.4);
      expect(result).not.toBeNull();
      expect(result!.cd0).toBeCloseTo(trueCD0, 3);
      expect(result!.k).toBeCloseTo(trueK, 3);
      expect(result!.rSquared).toBeGreaterThan(0.999);
    });

    it("should estimate CD0 and k from noisy synthetic data", () => {
      const trueCD0 = 0.02;
      const trueK = 0.045;

      // Use a seeded-like approach with deterministic "noise"
      const noiseValues = [
        0.001, -0.0005, 0.0008, -0.001, 0.0003,
        -0.0007, 0.0009, -0.0002, 0.0006, -0.0004,
        0.0001, -0.0008, 0.0005, -0.0003, 0.0007,
        -0.0001, 0.0004, -0.0006, 0.0002, -0.0009,
      ];

      for (let i = 0; i < 20; i++) {
        const cl = 0.2 + (i / 19) * 1.0;
        const cd = trueCD0 + trueK * cl * cl + noiseValues[i];
        estimator.addObservation({ cl, cd, mach: 0.78 });
      }

      const result = estimator.estimate(9.4);
      expect(result).not.toBeNull();
      expect(Math.abs(result!.cd0 - trueCD0)).toBeLessThan(0.005);
      expect(Math.abs(result!.k - trueK)).toBeLessThan(0.005);
      expect(result!.rSquared).toBeGreaterThan(0.95);
    });
  });

  describe("B738-like aircraft values", () => {
    const b738CD0 = 0.024;
    const b738K = 0.042;
    const b738AR = 9.4;

    beforeEach(() => {
      for (let cl = 0.1; cl <= 1.4; cl += 0.05) {
        const cd = b738CD0 + b738K * cl * cl;
        estimator.addObservation({ cl, cd, mach: 0.785 });
      }
    });

    it("should estimate Oswald efficiency: e = 1/(pi*k*AR) ~ 0.81", () => {
      const result = estimator.estimate(b738AR);
      expect(result).not.toBeNull();
      const expectedOswald = 1 / (Math.PI * b738K * b738AR);
      expect(result!.oswald).toBeCloseTo(expectedOswald, 2);
      expect(Math.abs(result!.oswald - 0.81)).toBeLessThan(0.02);
    });

    it("should pass through aspect ratio", () => {
      const result = estimator.estimate(b738AR);
      expect(result).not.toBeNull();
      expect(result!.aspectRatio).toBe(b738AR);
    });

    it("should compute average Mach", () => {
      const result = estimator.estimate(b738AR);
      expect(result).not.toBeNull();
      expect(result!.mach).toBeCloseTo(0.785, 2);
    });
  });

  describe("maxLiftToDrag", () => {
    it("should compute L/D_max = 1/(2*sqrt(CD0*k)) ~ 15.2 for B738", () => {
      const polar = {
        cd0: 0.024,
        k: 0.042,
        oswald: 0.81,
        aspectRatio: 9.4,
      };
      const ldMax = estimator.maxLiftToDrag(polar);
      const expected = 1 / (2 * Math.sqrt(0.024 * 0.042));
      expect(ldMax).toBeCloseTo(expected, 1);
      expect(Math.abs(ldMax - 15.2)).toBeLessThan(1);
    });

    it("should return 0 for zero CD0", () => {
      const polar = { cd0: 0, k: 0.042, oswald: 0.81, aspectRatio: 9.4 };
      expect(estimator.maxLiftToDrag(polar)).toBe(0);
    });

    it("should return 0 for zero k", () => {
      const polar = { cd0: 0.024, k: 0, oswald: 0.81, aspectRatio: 9.4 };
      expect(estimator.maxLiftToDrag(polar)).toBe(0);
    });
  });

  describe("minimumDragCL", () => {
    it("should compute CL_md = sqrt(CD0/k) ~ 0.76 for B738", () => {
      const polar = {
        cd0: 0.024,
        k: 0.042,
        oswald: 0.81,
        aspectRatio: 9.4,
      };
      const clMd = estimator.minimumDragCL(polar);
      const expected = Math.sqrt(0.024 / 0.042);
      expect(clMd).toBeCloseTo(expected, 2);
    });

    it("should return 0 when k is 0", () => {
      const polar = { cd0: 0.024, k: 0, oswald: 0, aspectRatio: 9.4 };
      expect(estimator.minimumDragCL(polar)).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should return null with fewer than 2 observations", () => {
      expect(estimator.estimate()).toBeNull();

      estimator.addObservation({ cl: 0.5, cd: 0.03, mach: 0.78 });
      expect(estimator.estimate()).toBeNull();
    });

    it("should return null with collinear data (same CL)", () => {
      estimator.addObservation({ cl: 0.5, cd: 0.03, mach: 0.78 });
      estimator.addObservation({ cl: 0.5, cd: 0.04, mach: 0.78 });
      estimator.addObservation({ cl: 0.5, cd: 0.035, mach: 0.78 });

      // Same CL^2 for all observations means the design matrix is singular
      const result = estimator.estimate();
      expect(result).toBeNull();
    });

    it("should track observation count", () => {
      expect(estimator.count).toBe(0);
      estimator.addObservation({ cl: 0.5, cd: 0.03, mach: 0.78 });
      expect(estimator.count).toBe(1);
      estimator.addObservation({ cl: 0.6, cd: 0.04, mach: 0.78 });
      expect(estimator.count).toBe(2);
    });

    it("should clear observations", () => {
      estimator.addObservation({ cl: 0.5, cd: 0.03, mach: 0.78 });
      estimator.addObservation({ cl: 0.6, cd: 0.04, mach: 0.78 });
      estimator.clear();
      expect(estimator.count).toBe(0);
      expect(estimator.estimate()).toBeNull();
    });

    it("should accept batch observations", () => {
      estimator.addObservations([
        { cl: 0.3, cd: 0.024, mach: 0.78 },
        { cl: 0.5, cd: 0.031, mach: 0.78 },
        { cl: 0.7, cd: 0.042, mach: 0.78 },
        { cl: 0.9, cd: 0.056, mach: 0.78 },
      ]);
      expect(estimator.count).toBe(4);
      const result = estimator.estimate();
      expect(result).not.toBeNull();
    });

    it("should clamp CD0 to non-negative", () => {
      // Provide data that could produce a negative intercept
      // This is handled by Math.max(0, cd0) in the source
      estimator.addObservation({ cl: 0.9, cd: 0.05, mach: 0.78 });
      estimator.addObservation({ cl: 1.0, cd: 0.06, mach: 0.78 });
      const result = estimator.estimate();
      if (result) {
        expect(result.cd0).toBeGreaterThanOrEqual(0);
        expect(result.k).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
