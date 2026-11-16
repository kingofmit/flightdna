import { describe, it, expect, beforeEach } from "vitest";
import { MLAnomalyDetector } from "../ml-anomaly";
import type { FlightState } from "@flightdna/core";

function makeState(overrides: {
  latitude?: number;
  longitude?: number;
  altitude?: number;
  groundSpeed?: number;
  verticalRate?: number;
  track?: number;
  timestamp?: number;
} = {}): FlightState {
  return {
    aircraft: { icao24: "abc123" },
    timestamp: overrides.timestamp ?? Date.now(),
    position: {
      latitude: overrides.latitude ?? 52.0,
      longitude: overrides.longitude ?? 4.0,
      altitude: overrides.altitude ?? 10000,
    },
    velocity: {
      groundSpeed: overrides.groundSpeed ?? 230,
      track: overrides.track ?? 90,
      verticalRate: overrides.verticalRate ?? 0,
    },
    onGround: false,
    source: "test",
  };
}

/**
 * Feed a sequence of normal cruise states into the detector.
 * Returns the base timestamp used.
 */
function feedNormalStates(
  detector: MLAnomalyDetector,
  count: number,
  baseTime = 1_000_000_000,
): number {
  for (let i = 0; i < count; i++) {
    // Add small realistic variation to avoid degenerate zero-variance
    const speedJitter = (i % 5) - 2; // -2 to +2 m/s
    const altJitter = (i % 7) - 3; // -3 to +3 m
    detector.analyze(
      makeState({
        groundSpeed: 230 + speedJitter,
        altitude: 10000 + altJitter,
        verticalRate: 0.1 * ((i % 3) - 1),
        track: 90 + 0.1 * ((i % 5) - 2),
        timestamp: baseTime + i * 5000, // 5-second intervals
      }),
    );
  }
  return baseTime;
}

describe("MLAnomalyDetector", () => {
  let detector: MLAnomalyDetector;

  beforeEach(() => {
    detector = new MLAnomalyDetector();
  });

  describe("training phase", () => {
    it("should not detect anomalies during the first 100 samples", () => {
      const baseTime = 1_000_000_000;
      const anomalies: (ReturnType<MLAnomalyDetector["analyze"]>)[] = [];

      for (let i = 0; i < 102; i++) {
        // 102 calls = 1 initial (no prev) + 101 with features, but only 100 counted
        const result = detector.analyze(
          makeState({
            groundSpeed: 230 + (i % 5) - 2,
            altitude: 10000 + (i % 7) - 3,
            verticalRate: 0.1 * ((i % 3) - 1),
            track: 90,
            timestamp: baseTime + i * 5000,
          }),
        );
        if (i < 101) {
          // During training (sampleCount < 100), should always be null
          anomalies.push(result);
        }
      }

      // All results during training phase should be null
      const detected = anomalies.filter((a) => a !== null);
      expect(detected).toHaveLength(0);
    });
  });

  describe("normal operation after training", () => {
    it("should have low reconstruction error after 150+ normal samples", () => {
      feedNormalStates(detector, 160);
      const stats = detector.getStats();

      expect(stats.trained).toBe(true);
      expect(stats.sampleCount).toBeGreaterThanOrEqual(150);
      // Error mean should be reasonably small after training on consistent data
      expect(stats.errorMean).toBeLessThan(1.0);
    });

    it("should not flag normal states as anomalies after training", () => {
      const baseTime = feedNormalStates(detector, 160);

      // Feed 20 more normal states and check none are flagged
      const anomalies: (ReturnType<MLAnomalyDetector["analyze"]>)[] = [];
      for (let i = 160; i < 180; i++) {
        const result = detector.analyze(
          makeState({
            groundSpeed: 230 + (i % 5) - 2,
            altitude: 10000 + (i % 7) - 3,
            verticalRate: 0.1 * ((i % 3) - 1),
            track: 90 + 0.1 * ((i % 5) - 2),
            timestamp: baseTime + i * 5000,
          }),
        );
        anomalies.push(result);
      }

      const detected = anomalies.filter((a) => a !== null);
      expect(detected).toHaveLength(0);
    });
  });

  describe("getStats", () => {
    it("should report correct sample count and trained status", () => {
      // Before any data
      let stats = detector.getStats();
      expect(stats.sampleCount).toBe(0);
      expect(stats.trained).toBe(false);

      // After some data (not enough to train)
      feedNormalStates(detector, 50);
      stats = detector.getStats();
      // sampleCount is less than 100 because first state has no prev
      expect(stats.sampleCount).toBeLessThan(100);
      expect(stats.trained).toBe(false);

      // After enough data
      feedNormalStates(detector, 110);
      stats = detector.getStats();
      expect(stats.trained).toBe(true);
      expect(stats.errorMean).toBeGreaterThanOrEqual(0);
      expect(stats.errorStd).toBeGreaterThanOrEqual(0);
    });
  });

  describe("anomaly detection", () => {
    it("should detect a sudden extreme state after training", () => {
      const baseTime = feedNormalStates(detector, 200);

      // Inject a wildly abnormal state: huge speed, altitude jump, extreme vertical rate
      const result = detector.analyze(
        makeState({
          groundSpeed: 600, // way above normal 230
          altitude: 20000, // way above normal 10000
          verticalRate: 50, // extreme
          track: 270, // opposite direction
          timestamp: baseTime + 200 * 5000,
        }),
      );

      expect(result).not.toBeNull();
      expect(result!.type).toBe("ml_reconstruction_error");
      expect(result!.deviation).toBeGreaterThan(0);
      expect(result!.id).toMatch(/^ml-anomaly-/);
      expect(["info", "warning", "critical"]).toContain(result!.severity);
    });
  });

  describe("reset", () => {
    it("should clear all state and restart training", () => {
      feedNormalStates(detector, 160);
      expect(detector.getStats().trained).toBe(true);

      detector.reset();

      const stats = detector.getStats();
      expect(stats.sampleCount).toBe(0);
      expect(stats.errorMean).toBe(0);
      expect(stats.errorStd).toBe(0);
      expect(stats.trained).toBe(false);

      // After reset, training phase should apply again
      const baseTime = 2_000_000_000;
      const result = detector.analyze(
        makeState({
          groundSpeed: 600,
          altitude: 20000,
          verticalRate: 50,
          timestamp: baseTime,
        }),
      );
      // No prev state after reset, so null
      expect(result).toBeNull();
    });
  });

  describe("configuration variants", () => {
    it("should work with different hiddenSize values", () => {
      const detectors = [
        new MLAnomalyDetector({ hiddenSize: 2 }),
        new MLAnomalyDetector({ hiddenSize: 8 }),
        new MLAnomalyDetector({ hiddenSize: 16 }),
      ];

      for (const det of detectors) {
        feedNormalStates(det, 110);
        const stats = det.getStats();
        expect(stats.trained).toBe(true);
        expect(stats.sampleCount).toBeGreaterThan(0);
      }
    });

    it("should work with different learningRate values", () => {
      const detectors = [
        new MLAnomalyDetector({ learningRate: 0.0001 }),
        new MLAnomalyDetector({ learningRate: 0.01 }),
        new MLAnomalyDetector({ learningRate: 0.1 }),
      ];

      for (const det of detectors) {
        feedNormalStates(det, 110);
        const stats = det.getStats();
        expect(stats.trained).toBe(true);
        // Should not produce NaN or Infinity
        expect(Number.isFinite(stats.errorMean)).toBe(true);
        expect(Number.isFinite(stats.errorStd)).toBe(true);
      }
    });
  });

  describe("determinism", () => {
    it("should produce the same reconstruction errors for the same input sequence", () => {
      const detectorA = new MLAnomalyDetector();
      const detectorB = new MLAnomalyDetector();

      const baseTime = 1_000_000_000;
      const statesA: (ReturnType<MLAnomalyDetector["analyze"]>)[] = [];
      const statesB: (ReturnType<MLAnomalyDetector["analyze"]>)[] = [];

      for (let i = 0; i < 120; i++) {
        const state = makeState({
          groundSpeed: 230 + (i % 5) - 2,
          altitude: 10000 + (i % 7) - 3,
          verticalRate: 0.1 * ((i % 3) - 1),
          track: 90 + 0.1 * ((i % 5) - 2),
          timestamp: baseTime + i * 5000,
        });

        statesA.push(detectorA.analyze(state));
        statesB.push(detectorB.analyze(state));
      }

      // Stats should be identical
      const statsA = detectorA.getStats();
      const statsB = detectorB.getStats();
      expect(statsA.sampleCount).toBe(statsB.sampleCount);
      expect(statsA.errorMean).toBe(statsB.errorMean);
      expect(statsA.errorStd).toBe(statsB.errorStd);

      // All results should be identical (both null or both non-null with same values)
      for (let i = 0; i < statesA.length; i++) {
        if (statesA[i] === null) {
          expect(statesB[i]).toBeNull();
        } else {
          expect(statesB[i]).not.toBeNull();
          expect(statesA[i]!.deviation).toBe(statesB[i]!.deviation);
        }
      }
    });
  });
});
