import { describe, it, expect, beforeEach } from "vitest";
import { FlightDynamicsModel } from "../dynamics-model";
import type { AircraftConfig, DragPolar, DynamicsState, ForceVector } from "../types";

describe("FlightDynamicsModel - Mach drag and RK4", () => {
  let model: FlightDynamicsModel;

  const b738Config: AircraftConfig = {
    mass: 65_000, // 65 tonnes
    wingArea: 124.6, // m²
    wingSpan: 34.3,
  };

  const polar: DragPolar = {
    cd0: 0.024,
    k: 0.042,
    oswald: 0.81,
    aspectRatio: 9.4,
  };

  beforeEach(() => {
    model = new FlightDynamicsModel(b738Config);
  });

  describe("constructor validation", () => {
    it("should throw on negative mass", () => {
      expect(() => new FlightDynamicsModel({ ...b738Config, mass: -100 })).toThrow(
        "Invalid aircraft mass",
      );
    });

    it("should throw on zero mass", () => {
      expect(() => new FlightDynamicsModel({ ...b738Config, mass: 0 })).toThrow(
        "Invalid aircraft mass",
      );
    });

    it("should throw on NaN mass", () => {
      expect(() => new FlightDynamicsModel({ ...b738Config, mass: NaN })).toThrow(
        "Invalid aircraft mass",
      );
    });

    it("should throw on zero wing area", () => {
      expect(() => new FlightDynamicsModel({ ...b738Config, wingArea: 0 })).toThrow(
        "Invalid wing area",
      );
    });

    it("should throw on negative wing area", () => {
      expect(() => new FlightDynamicsModel({ ...b738Config, wingArea: -10 })).toThrow(
        "Invalid wing area",
      );
    });
  });

  describe("computeForces edge cases", () => {
    it("should return zeros for zero airspeed", () => {
      const result = model.computeForces(1.225, 0, { cl: 0.5, cd: 0.03 });
      expect(result.lift).toBe(0);
      expect(result.drag).toBe(0);
      expect(result.sideForce).toBe(0);
    });

    it("should return zeros for zero density", () => {
      const result = model.computeForces(0, 100, { cl: 0.5, cd: 0.03 });
      expect(result.lift).toBe(0);
      expect(result.drag).toBe(0);
      expect(result.sideForce).toBe(0);
    });

    it("should return zeros for negative airspeed", () => {
      const result = model.computeForces(1.225, -50, { cl: 0.5, cd: 0.03 });
      expect(result.lift).toBe(0);
      expect(result.drag).toBe(0);
      expect(result.sideForce).toBe(0);
    });
  });

  describe("computeDragCoefficientWithMach", () => {
    it("below Mdd should equal standard polar", () => {
      const cl = 0.5;
      const mach = 0.72;
      const mdd = 0.78;

      const cd = model.computeDragCoefficientWithMach(cl, mach, polar, mdd);
      const expectedCd = polar.cd0 + polar.k * cl ** 2;
      expect(cd).toBeCloseTo(expectedCd, 8);
    });

    it("at exactly Mdd should equal standard polar (no wave drag)", () => {
      const cl = 0.5;
      const mdd = 0.78;

      const cd = model.computeDragCoefficientWithMach(cl, mdd, polar, mdd);
      const expectedCd = polar.cd0 + polar.k * cl ** 2;
      expect(cd).toBeCloseTo(expectedCd, 8);
    });

    it("above Mdd, wave drag should increase rapidly", () => {
      const cl = 0.5;
      const mdd = 0.78;

      const cdAt080 = model.computeDragCoefficientWithMach(cl, 0.80, polar, mdd);
      const cdAt082 = model.computeDragCoefficientWithMach(cl, 0.82, polar, mdd);
      const cdAt085 = model.computeDragCoefficientWithMach(cl, 0.85, polar, mdd);

      // Each should be strictly larger
      expect(cdAt082).toBeGreaterThan(cdAt080);
      expect(cdAt085).toBeGreaterThan(cdAt082);

      // The increase from 0.82->0.85 should be larger than 0.80->0.82
      // because wave drag is proportional to (M - Mdd)^4
      const delta1 = cdAt082 - cdAt080;
      const delta2 = cdAt085 - cdAt082;
      expect(delta2).toBeGreaterThan(delta1);
    });

    it("at M=0.85 with Mdd=0.78, wave drag contribution should be significant", () => {
      const cl = 0.5;
      const mdd = 0.78;

      const cdWithMach = model.computeDragCoefficientWithMach(cl, 0.85, polar, mdd);
      const cdSubsonic = polar.cd0 + polar.k * cl ** 2;
      const waveDrag = cdWithMach - cdSubsonic;

      // Wave drag = 20 * (0.85 - 0.78)^4 = 20 * 0.07^4 = 20 * 2.401e-5 ≈ 4.8e-4
      expect(waveDrag).toBeCloseTo(20 * 0.07 ** 4, 6);
      // Verify it is a meaningful fraction of subsonic drag
      expect(waveDrag / cdSubsonic).toBeGreaterThan(0.01);
    });

    it("should use default Mdd of 0.78 when not specified", () => {
      const cl = 0.5;
      const cdDefault = model.computeDragCoefficientWithMach(cl, 0.85, polar);
      const cdExplicit = model.computeDragCoefficientWithMach(
        cl,
        0.85,
        polar,
        0.78,
      );
      expect(cdDefault).toBeCloseTo(cdExplicit, 10);
    });
  });

  describe("computeDragWithMach", () => {
    it("should return drag force in Newtons", () => {
      const density = 0.41; // ~10 km altitude
      const airspeed = 240; // m/s
      const cl = 0.5;
      const mach = 0.81;

      const drag = model.computeDragWithMach(
        density,
        airspeed,
        cl,
        mach,
        polar,
      );
      expect(drag).toBeGreaterThan(0);
      // Check it is a reasonable magnitude for a transport aircraft
      expect(drag).toBeGreaterThan(1_000);
      expect(drag).toBeLessThan(500_000);
    });

    it("drag with Mach > Mdd should exceed standard drag", () => {
      const density = 0.41;
      const airspeed = 240;
      const cl = 0.5;

      const standardDrag = model.computeDrag(density, airspeed, cl, polar);
      const machDrag = model.computeDragWithMach(
        density,
        airspeed,
        cl,
        0.85,
        polar,
        0.78,
      );
      expect(machDrag).toBeGreaterThan(standardDrag);
    });
  });

  describe("RK4 propagation energy conservation", () => {
    it("should approximately conserve energy in level flight", () => {
      const G = 9.80665;
      const mass = b738Config.mass;
      const airspeed = 230; // m/s, body-frame forward

      // Set up level flight: thrust = drag, lift = weight
      // Pitch angle for level flight at this speed: theta ≈ 0
      const state: DynamicsState = {
        position: [0, 0, -10_000], // 10 km altitude (NED: z is down)
        velocity: [airspeed, 0, 0], // Forward velocity in body frame
        attitude: [0, 0, 0], // Level flight, heading north
        angularRate: [0, 0, 0],
        mass,
        time: 0,
      };

      // Compute required forces for level flight
      const weight = mass * G;
      // For level flight: Thrust = Drag (x-axis), Lift = Weight (z-axis, negative in body)
      const q = 0.5 * 0.41 * airspeed ** 2;
      const cl = weight / (q * b738Config.wingArea);
      const cd = polar.cd0 + polar.k * cl ** 2;
      const drag = q * b738Config.wingArea * cd;

      const forces: ForceVector = {
        x: drag, // Thrust equals drag for level flight
        y: 0,
        z: -weight, // Lift counters weight (upward in body frame)
      };

      // Propagate for 10 seconds with 1-second steps
      let current = state;
      for (let i = 0; i < 10; i++) {
        current = model.propagate(current, forces, 1.0);
      }

      // Speed should be approximately preserved (within 5%)
      const finalSpeed = Math.sqrt(
        current.velocity[0] ** 2 +
          current.velocity[1] ** 2 +
          current.velocity[2] ** 2,
      );
      expect(Math.abs(finalSpeed - airspeed) / airspeed).toBeLessThan(0.05);

      // Time should advance by 10 seconds
      expect(current.time).toBeCloseTo(10, 5);
    });
  });
});
