import { describe, it, expect, beforeEach } from "vitest";
import { ThrustModel } from "../thrust-model";
import type { ThrustModelConfig } from "../thrust-model";

describe("ThrustModel", () => {
  describe("turbofan", () => {
    let model: ThrustModel;
    const config: ThrustModelConfig = {
      maxThrustSL: 120_000, // 120 kN per engine (CFM56-class)
      engineCount: 2,
      engineType: "turbofan",
      bypassRatio: 5.1,
    };

    beforeEach(() => {
      model = new ThrustModel(config);
    });

    it("sea level static thrust should equal config value * engineCount", () => {
      // At sea level (sigma=1), Mach=0
      const thrust = model.availableThrust(0, 0, 1.225);
      // Mach factor at M=0: 1 - 0 + 0 = 1, alt factor at sigma=1: 1
      expect(thrust).toBeCloseTo(
        config.maxThrustSL * config.engineCount,
        0,
      );
    });

    it("thrust should decrease with altitude (lower density)", () => {
      const slThrust = model.availableThrust(0, 0.3, 1.225);
      // At ~10,000m, density is roughly 0.41 kg/m³
      const altThrust = model.availableThrust(10_000, 0.3, 0.41);
      expect(altThrust).toBeLessThan(slThrust);
    });

    it("thrust should decrease with Mach (inlet losses)", () => {
      const lowMach = model.availableThrust(0, 0.2, 1.225);
      const highMach = model.availableThrust(0, 0.8, 1.225);
      expect(highMach).toBeLessThan(lowMach);
    });

    it("thrust should remain positive even at high Mach", () => {
      const thrust = model.availableThrust(10_000, 0.85, 0.41);
      expect(thrust).toBeGreaterThan(0);
    });
  });

  describe("turboprop", () => {
    let model: ThrustModel;
    const config: ThrustModelConfig = {
      maxThrustSL: 25_000, // 25 kN per engine
      engineCount: 2,
      engineType: "turboprop",
    };

    beforeEach(() => {
      model = new ThrustModel(config);
    });

    it("thrust should decrease with altitude", () => {
      const slThrust = model.availableThrust(0, 0.3, 1.225);
      const altThrust = model.availableThrust(5_000, 0.3, 0.736);
      expect(altThrust).toBeLessThan(slThrust);
    });

    it("thrust should decrease faster with Mach than turbofan", () => {
      // Turboprop: T ~ 1/M (power-based)
      const tpModel = new ThrustModel(config);
      const tpLow = tpModel.availableThrust(0, 0.2, 1.225);
      const tpHigh = tpModel.availableThrust(0, 0.5, 1.225);
      const tpRatio = tpHigh / tpLow;

      const tfConfig: ThrustModelConfig = {
        maxThrustSL: 25_000,
        engineCount: 2,
        engineType: "turbofan",
        bypassRatio: 5,
      };
      const tfModel = new ThrustModel(tfConfig);
      const tfLow = tfModel.availableThrust(0, 0.2, 1.225);
      const tfHigh = tfModel.availableThrust(0, 0.5, 1.225);
      const tfRatio = tfHigh / tfLow;

      // Turboprop thrust falls off faster with Mach
      expect(tpRatio).toBeLessThan(tfRatio);
    });
  });

  describe("piston", () => {
    let model: ThrustModel;
    const config: ThrustModelConfig = {
      maxThrustSL: 5_000,
      engineCount: 1,
      engineType: "piston",
    };

    beforeEach(() => {
      model = new ThrustModel(config);
    });

    it("sea level thrust should equal config value", () => {
      const thrust = model.availableThrust(0, 0.1, 1.225);
      expect(thrust).toBeCloseTo(config.maxThrustSL, 0);
    });

    it("thrust should scale linearly with density ratio", () => {
      const halfDensity = 1.225 / 2;
      const thrust = model.availableThrust(5_000, 0.1, halfDensity);
      expect(thrust).toBeCloseTo(config.maxThrustSL * 0.5, 0);
    });
  });

  describe("estimateSFC", () => {
    it("turbofan SFC should be positive and in reasonable range", () => {
      const model = new ThrustModel({
        maxThrustSL: 120_000,
        engineCount: 2,
        engineType: "turbofan",
      });
      const sfc = model.estimateSFC(0.78, 10_000);
      // Expected: ~17e-6 * (1 + 0.5*0.78) ≈ 2.36e-5 kg/(N·s)
      expect(sfc).toBeGreaterThan(1e-5);
      expect(sfc).toBeLessThan(5e-5);
    });

    it("turbofan SFC should increase with Mach", () => {
      const model = new ThrustModel({
        maxThrustSL: 120_000,
        engineCount: 2,
        engineType: "turbofan",
      });
      const sfcLow = model.estimateSFC(0.3, 10_000);
      const sfcHigh = model.estimateSFC(0.85, 10_000);
      expect(sfcHigh).toBeGreaterThan(sfcLow);
    });

    it("turboprop SFC should be constant (no Mach dependence in model)", () => {
      const model = new ThrustModel({
        maxThrustSL: 25_000,
        engineCount: 2,
        engineType: "turboprop",
      });
      const sfc1 = model.estimateSFC(0.3, 5_000);
      const sfc2 = model.estimateSFC(0.5, 5_000);
      expect(sfc1).toBe(sfc2);
      expect(sfc1).toBeCloseTo(2.8e-5, 7);
    });

    it("piston SFC should be highest", () => {
      const piston = new ThrustModel({
        maxThrustSL: 5_000,
        engineCount: 1,
        engineType: "piston",
      });
      const turbofan = new ThrustModel({
        maxThrustSL: 120_000,
        engineCount: 2,
        engineType: "turbofan",
      });
      expect(piston.estimateSFC(0.2, 0)).toBeGreaterThan(
        turbofan.estimateSFC(0.2, 0),
      );
    });
  });
});
