import { describe, it, expect, beforeEach } from "vitest";
import { TurbulenceDetector } from "../turbulence";
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
 * Generate N cruise states with given vertical rate standard deviation.
 * Vertical rates are drawn from a simple deterministic pattern that
 * approximates the desired standard deviation.
 */
function feedCruiseStates(
  detector: TurbulenceDetector,
  count: number,
  vrateStd: number,
): ReturnType<TurbulenceDetector["update"]> {
  const baseTime = Date.now();
  let result: ReturnType<TurbulenceDetector["update"]> = null;

  for (let i = 0; i < count; i++) {
    // Deterministic pattern with roughly the desired std dev
    const vrate = vrateStd * Math.sin((2 * Math.PI * i) / 7);
    result = detector.update(
      makeState({
        altitude: 10000 + Math.random() * 10, // small noise
        groundSpeed: 230,
        verticalRate: vrate,
        timestamp: baseTime + i * 10_000,
      }),
    );
  }
  return result;
}

describe("TurbulenceDetector", () => {
  let detector: TurbulenceDetector;

  beforeEach(() => {
    detector = new TurbulenceDetector({ windowSize: 30 });
  });

  describe("insufficient data", () => {
    it("should return null with fewer than 10 samples", () => {
      for (let i = 0; i < 9; i++) {
        const result = detector.update(
          makeState({ timestamp: Date.now() + i * 10_000 }),
        );
        expect(result).toBeNull();
      }
    });
  });

  describe("low altitude filtering", () => {
    it("should return null at low altitude (< 6000m)", () => {
      for (let i = 0; i < 15; i++) {
        const result = detector.update(
          makeState({
            altitude: 3000,
            groundSpeed: 230,
            verticalRate: 2 * Math.sin(i),
            timestamp: Date.now() + i * 10_000,
          }),
        );
        // Should always be null since altitude < 6000
        expect(result).toBeNull();
      }
    });
  });

  describe("climb/descent filtering", () => {
    it("should return null during systematic climb (altitude trend > 2 m/sample)", () => {
      const baseTime = Date.now();
      let result: ReturnType<TurbulenceDetector["update"]> = null;

      for (let i = 0; i < 30; i++) {
        // Climbing at ~50m per sample — well above the 2 m/sample threshold
        result = detector.update(
          makeState({
            altitude: 8000 + i * 50,
            groundSpeed: 230,
            verticalRate: 5,
            timestamp: baseTime + i * 10_000,
          }),
        );
      }
      expect(result).toBeNull();
    });
  });

  describe("light turbulence", () => {
    it("should detect light or no turbulence with small vrate variance (sigma ~0.5 m/s)", () => {
      const result = feedCruiseStates(detector, 30, 0.5);
      expect(result).not.toBeNull();
      expect(result!.edr).toBeGreaterThanOrEqual(0);
      expect(result!.edr).toBeLessThan(1);
      expect(["none", "light"]).toContain(result!.intensity);
      expect(result!.confidence).toBeGreaterThan(0);
      expect(result!.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe("moderate turbulence", () => {
    it("should detect moderate turbulence with vrate sigma ~3 m/s", () => {
      const result = feedCruiseStates(detector, 30, 3);
      expect(result).not.toBeNull();
      expect(result!.edr).toBeGreaterThan(0.05);
      expect(result!.edr).toBeLessThan(1);
      expect(["light", "moderate"]).toContain(result!.intensity);
    });
  });

  describe("severe turbulence", () => {
    it("should detect severe turbulence with vrate sigma ~8 m/s", () => {
      const result = feedCruiseStates(detector, 30, 8);
      expect(result).not.toBeNull();
      expect(result!.edr).toBeGreaterThan(0.1);
      expect(result!.edr).toBeLessThan(1);
      expect(["moderate", "severe", "extreme"]).toContain(result!.intensity);
    });
  });

  describe("reset", () => {
    it("should clear all buffers on reset", () => {
      // Fill with enough data to get a result
      feedCruiseStates(detector, 15, 1);

      detector.reset();

      // After reset, should need data again
      const result = detector.update(
        makeState({ timestamp: Date.now() }),
      );
      expect(result).toBeNull();
    });
  });

  describe("EDR range", () => {
    it("should produce EDR values in a reasonable range (0-1)", () => {
      // Test with various turbulence levels
      for (const sigma of [0.1, 0.5, 1, 3, 5, 8]) {
        const det = new TurbulenceDetector({ windowSize: 30 });
        const result = feedCruiseStatesForDetector(det, 30, sigma);
        if (result !== null) {
          expect(result.edr).toBeGreaterThanOrEqual(0);
          expect(result.edr).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe("output fields", () => {
    it("should include position, altitude, confidence, and timestamp", () => {
      const result = feedCruiseStates(detector, 30, 2);
      expect(result).not.toBeNull();
      expect(result!.altitude).toBeGreaterThan(0);
      expect(result!.latitude).toBeDefined();
      expect(result!.longitude).toBeDefined();
      expect(result!.timestamp).toBeGreaterThan(0);
      expect(result!.confidence).toBeGreaterThan(0);
      expect(result!.confidence).toBeLessThanOrEqual(1);
    });
  });
});

/** Helper to feed cruise states into an arbitrary detector instance. */
function feedCruiseStatesForDetector(
  detector: TurbulenceDetector,
  count: number,
  vrateStd: number,
): ReturnType<TurbulenceDetector["update"]> {
  const baseTime = Date.now();
  let result: ReturnType<TurbulenceDetector["update"]> = null;

  for (let i = 0; i < count; i++) {
    const vrate = vrateStd * Math.sin((2 * Math.PI * i) / 7);
    result = detector.update(
      makeState({
        altitude: 10000 + Math.random() * 10,
        groundSpeed: 230,
        verticalRate: vrate,
        timestamp: baseTime + i * 10_000,
      }),
    );
  }
  return result;
}
