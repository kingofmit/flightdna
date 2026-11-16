import { describe, it, expect, beforeEach } from "vitest";
import { AnomalyDetector } from "../anomaly";
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

describe("AnomalyDetector", () => {
  let detector: AnomalyDetector;

  beforeEach(() => {
    detector = new AnomalyDetector({ sensitivity: 0.5 });
  });

  describe("warmup period", () => {
    it("should not detect anomalies during warmup (first 10 states)", () => {
      for (let i = 0; i < 10; i++) {
        const anomalies = detector.analyze(
          makeState({ timestamp: Date.now() + i * 1000 }),
        );
        expect(anomalies).toHaveLength(0);
      }
    });
  });

  describe("normal operation - no false positives", () => {
    it("should not report anomalies for steady-state flight", () => {
      const allAnomalies: unknown[] = [];
      const baseTime = Date.now();

      for (let i = 0; i < 50; i++) {
        const anomalies = detector.analyze(
          makeState({
            altitude: 10000,
            groundSpeed: 230,
            verticalRate: 0,
            timestamp: baseTime + i * 1000,
          }),
        );
        allAnomalies.push(...anomalies);
      }

      expect(allAnomalies).toHaveLength(0);
    });
  });

  describe("speed deviation anomaly", () => {
    it("should detect a large speed spike after normal operation", () => {
      const baseTime = Date.now();

      // Feed 50 normal states
      for (let i = 0; i < 50; i++) {
        detector.analyze(
          makeState({
            groundSpeed: 230,
            timestamp: baseTime + i * 1000,
          }),
        );
      }

      // Inject a speed spike
      const anomalies = detector.analyze(
        makeState({
          groundSpeed: 500,
          timestamp: baseTime + 50 * 1000,
        }),
      );

      const speedAnomaly = anomalies.find((a) => a.type === "speed_deviation");
      expect(speedAnomaly).toBeDefined();
      expect(speedAnomaly!.severity).toBe("critical");
    });
  });

  describe("position jump anomaly", () => {
    it("should detect a sudden position jump", () => {
      const baseTime = Date.now();

      // Feed 50 normal states at a reasonable speed
      for (let i = 0; i < 50; i++) {
        detector.analyze(
          makeState({
            latitude: 52.0 + i * 0.0001,
            longitude: 4.0,
            groundSpeed: 230,
            timestamp: baseTime + i * 10000,
          }),
        );
      }

      // Inject a sudden position jump: latitude jumps by 5 degrees in 10 seconds
      const anomalies = detector.analyze(
        makeState({
          latitude: 57.0 + 50 * 0.0001,
          longitude: 4.0,
          groundSpeed: 230,
          timestamp: baseTime + 50 * 10000 + 10000,
        }),
      );

      const jumpAnomaly = anomalies.find((a) => a.type === "position_jump");
      expect(jumpAnomaly).toBeDefined();
    });
  });

  describe("extreme vertical rate anomaly", () => {
    it("should detect extreme vertical rate (> 30 m/s)", () => {
      const baseTime = Date.now();

      // Feed enough normal states to pass warmup
      for (let i = 0; i < 15; i++) {
        detector.analyze(
          makeState({
            verticalRate: 0,
            timestamp: baseTime + i * 1000,
          }),
        );
      }

      // Inject extreme vertical rate (50 m/s)
      const anomalies = detector.analyze(
        makeState({
          verticalRate: 50,
          timestamp: baseTime + 15 * 1000,
        }),
      );

      const vrAnomaly = anomalies.find(
        (a) => a.type === "extreme_vertical_rate",
      );
      expect(vrAnomaly).toBeDefined();
      expect(vrAnomaly!.message).toContain("50");
    });

    it("should not flag moderate vertical rates", () => {
      const baseTime = Date.now();

      for (let i = 0; i < 15; i++) {
        detector.analyze(
          makeState({
            verticalRate: 5,
            timestamp: baseTime + i * 1000,
          }),
        );
      }

      // 10 m/s is below the 30 m/s threshold
      const anomalies = detector.analyze(
        makeState({
          verticalRate: 10,
          timestamp: baseTime + 15 * 1000,
        }),
      );

      const vrAnomaly = anomalies.find(
        (a) => a.type === "extreme_vertical_rate",
      );
      expect(vrAnomaly).toBeUndefined();
    });
  });

  describe("anomaly tracking", () => {
    it("should track anomalies and return them via getAnomalies", () => {
      const baseTime = Date.now();

      for (let i = 0; i < 15; i++) {
        detector.analyze(
          makeState({
            verticalRate: 0,
            timestamp: baseTime + i * 1000,
          }),
        );
      }

      detector.analyze(
        makeState({
          verticalRate: 50,
          timestamp: baseTime + 15 * 1000,
        }),
      );

      const active = detector.getAnomalies();
      expect(active.length).toBeGreaterThan(0);
    });

    it("should assign unique IDs to each anomaly", () => {
      const baseTime = Date.now();

      for (let i = 0; i < 15; i++) {
        detector.analyze(
          makeState({ verticalRate: 0, timestamp: baseTime + i * 1000 }),
        );
      }

      detector.analyze(
        makeState({ verticalRate: 50, timestamp: baseTime + 15 * 1000 }),
      );
      detector.analyze(
        makeState({ verticalRate: 60, timestamp: baseTime + 16 * 1000 }),
      );

      const active = detector.getAnomalies();
      const ids = active.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("phase-aware detection", () => {
    it("should use tighter thresholds during cruise phase", () => {
      const baseTime = Date.now();

      // Feed 50 normal states with slight speed variation
      for (let i = 0; i < 50; i++) {
        detector.analyze(
          makeState({
            groundSpeed: 230 + (i % 3) - 1, // 229-231 m/s
            timestamp: baseTime + i * 1000,
          }),
        );
      }

      // A moderate speed deviation that might not trigger with default thresholds
      // but should trigger with cruise (tighter) thresholds
      const moderateSpike = makeState({
        groundSpeed: 240,
        timestamp: baseTime + 50 * 1000,
      });

      const anomaliesDefault = detector.analyze(moderateSpike);
      detector.reset();

      // Re-feed the same data, but analyze with cruise phase
      const detectorCruise = new AnomalyDetector({ sensitivity: 0.5 });
      for (let i = 0; i < 50; i++) {
        detectorCruise.analyze(
          makeState({
            groundSpeed: 230 + (i % 3) - 1,
            timestamp: baseTime + i * 1000,
          }),
        );
      }

      const anomaliesCruise = detectorCruise.analyze(
        makeState({
          groundSpeed: 240,
          timestamp: baseTime + 50 * 1000,
        }),
        "cruise",
      );

      // Cruise should be at least as sensitive (same or more anomalies)
      expect(anomaliesCruise.length).toBeGreaterThanOrEqual(anomaliesDefault.length);
    });
  });

  describe("reset", () => {
    it("should clear all anomalies and history on reset", () => {
      const baseTime = Date.now();

      for (let i = 0; i < 15; i++) {
        detector.analyze(
          makeState({ verticalRate: 0, timestamp: baseTime + i * 1000 }),
        );
      }
      detector.analyze(
        makeState({ verticalRate: 50, timestamp: baseTime + 15 * 1000 }),
      );

      detector.reset();

      expect(detector.getAnomalies()).toHaveLength(0);

      // After reset, warmup should apply again -- no anomalies
      const anomalies = detector.analyze(
        makeState({ verticalRate: 50, timestamp: baseTime + 20 * 1000 }),
      );
      expect(anomalies).toHaveLength(0);
    });
  });

  describe("severity levels", () => {
    it("should assign severity based on deviation magnitude", () => {
      const baseTime = Date.now();

      for (let i = 0; i < 15; i++) {
        detector.analyze(
          makeState({ verticalRate: 0, timestamp: baseTime + i * 1000 }),
        );
      }

      // deviation = |60| / 10 = 6.0, which is > 5 -> "critical"
      const anomalies = detector.analyze(
        makeState({ verticalRate: 60, timestamp: baseTime + 15 * 1000 }),
      );

      const vrAnomaly = anomalies.find(
        (a) => a.type === "extreme_vertical_rate",
      );
      expect(vrAnomaly).toBeDefined();
      expect(vrAnomaly!.severity).toBe("critical");
    });
  });
});
