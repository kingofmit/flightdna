import { describe, it, expect, beforeEach } from "vitest";
import { KalmanFilter } from "../kalman";

describe("KalmanFilter", () => {
  let kf: KalmanFilter;

  beforeEach(() => {
    kf = new KalmanFilter({
      processNoise: 1.0,
      positionNoise: 50,
      velocityNoise: 5,
    });
  });

  describe("initialization", () => {
    it("should not be initialized before first measurement", () => {
      expect(kf.isInitialized).toBe(false);
    });

    it("should have lastUpdateFailed as false initially", () => {
      expect(kf.lastUpdateFailed).toBe(false);
    });

    it("should initialize with first measurement", () => {
      const measurement = [52.0, 4.0, 10000, 200, 50, -2];
      kf.update(measurement, 1000);
      expect(kf.isInitialized).toBe(true);
    });

    it("should set state to first measurement on init", () => {
      const measurement = [52.0, 4.0, 10000, 200, 50, -2];
      kf.update(measurement, 1000);
      const state = kf.getState();
      for (let i = 0; i < 6; i++) {
        expect(state.x[i]).toBe(measurement[i]);
      }
    });

    it("should set timestamp on init", () => {
      kf.update([52, 4, 10000, 200, 50, -2], 5000);
      expect(kf.getState().timestamp).toBe(5000);
    });
  });

  describe("state estimation after update", () => {
    it("should approximately equal measurement after a single update", () => {
      const m1 = [52.0, 4.0, 10000, 200, 50, -2];
      kf.update(m1, 1000);

      const m2 = [52.01, 4.01, 10010, 201, 51, -1.5];
      kf.update(m2, 2000);

      const state = kf.getState();
      // After just one update post-init, the state should be close to the measurement
      for (let i = 0; i < 6; i++) {
        expect(Math.abs(state.x[i] - m2[i])).toBeLessThan(Math.abs(m2[i]) * 0.5 + 10);
      }
    });

    it("should converge after multiple updates with constant values", () => {
      const constant = [52.0, 4.0, 10000, 200, 50, 0];

      kf.update(constant, 1000);
      for (let t = 2000; t <= 20000; t += 1000) {
        kf.update(constant, t);
      }

      const state = kf.getState();
      for (let i = 0; i < 6; i++) {
        // After many identical measurements, state should be very close
        expect(Math.abs(state.x[i] - constant[i])).toBeLessThan(
          Math.abs(constant[i]) * 0.01 + 1,
        );
      }
    });
  });

  describe("predict step", () => {
    it("should not change state before initialization", () => {
      const stateBefore = kf.getState();
      kf.predict(5000);
      const stateAfter = kf.getState();
      expect(stateAfter.timestamp).toBe(stateBefore.timestamp);
    });

    it("should extrapolate position forward using velocity", () => {
      // Initialize with northward velocity of 100 m/s
      const vN = 100; // m/s north
      const measurement = [0, 0, 10000, vN, 0, 0];
      kf.update(measurement, 0);

      // Predict 1 second ahead
      kf.predict(1000);

      const state = kf.getState();
      // EKF propagates lat in degrees: lat += vN * dt / 111320
      // So after 1 second at 100 m/s: delta_lat ≈ 100 / 111320 ≈ 0.000898 degrees
      const expectedDeltaLat = vN / 111320;
      expect(state.x[0]).toBeCloseTo(expectedDeltaLat, 5);
      // Velocity should remain approximately the same
      expect(state.x[3]).toBeCloseTo(vN, 0);
    });

    it("should not predict backwards (dt <= 0)", () => {
      kf.update([0, 0, 10000, 100, 0, 0], 5000);
      const stateBefore = kf.getState();

      kf.predict(4000); // Earlier timestamp
      const stateAfter = kf.getState();

      expect(stateAfter.x[0]).toBe(stateBefore.x[0]);
      expect(stateAfter.timestamp).toBe(stateBefore.timestamp);
    });
  });

  describe("noise filtering with synthetic trajectory", () => {
    it("should produce lower RMSE than raw noisy measurements", () => {
      // Straight-line trajectory: constant position, noisy measurements
      const trueLat = 52.0;
      const numSteps = 50;
      const dt = 1000;

      // Deterministic noise pattern (larger scale so it's above filter noise floor)
      const noisePattern = [
        30, -20, 50, -10, 40, -30, 10, -50, 20, -40,
      ];

      let rawSumSq = 0;
      let filteredSumSq = 0;

      for (let i = 0; i < numSteps; i++) {
        const noise = noisePattern[i % noisePattern.length];
        const noisyLat = trueLat + noise / 111320; // noise in meters converted to degrees

        const measurement = [noisyLat, 4.0, 10000, 0, 0, 0];
        kf.update(measurement, i * dt);

        rawSumSq += (noise / 111320) ** 2;

        const state = kf.getState();
        filteredSumSq += (state.x[0] - trueLat) ** 2;
      }

      const rawRMSE = Math.sqrt(rawSumSq / numSteps);
      const filteredRMSE = Math.sqrt(filteredSumSq / numSteps);

      // Filtered output should have lower RMSE than raw measurements
      expect(filteredRMSE).toBeLessThan(rawRMSE);
    });
  });

  describe("getState returns a copy", () => {
    it("should not allow external mutation of internal state", () => {
      kf.update([10, 20, 30, 1, 2, 3], 1000);
      const state1 = kf.getState();
      state1.x[0] = 999;

      const state2 = kf.getState();
      expect(state2.x[0]).toBe(10);
    });
  });

  describe("covariance matrix", () => {
    it("should have an 8x8 covariance matrix (EKF state: lat, lon, alt, vN, vE, vD, heading, turnRate)", () => {
      kf.update([0, 0, 0, 0, 0, 0], 0);
      const state = kf.getState();
      expect(state.P.length).toBe(8);
      for (const row of state.P) {
        expect(row.length).toBe(8);
      }
    });

    it("should have decreasing diagonal entries after repeated measurements", () => {
      kf.update([0, 0, 10000, 0, 0, 0], 0);
      const initialP = kf.getState().P;

      for (let t = 1; t <= 10; t++) {
        kf.update([0, 0, 10000, 0, 0, 0], t * 1000);
      }

      const finalP = kf.getState().P;
      // First 6 diagonal entries (observed states) should decrease with more measurements
      for (let i = 0; i < 6; i++) {
        expect(finalP[i][i]).toBeLessThan(initialP[i][i]);
      }
    });
  });
});
