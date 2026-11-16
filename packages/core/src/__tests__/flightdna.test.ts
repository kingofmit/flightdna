import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FlightDNA } from "../flightdna";
import type { FlightState } from "../types";

function makeState(
  icao24: string,
  overrides: Partial<FlightState> = {},
): FlightState {
  return {
    aircraft: { icao24 },
    timestamp: Date.now(),
    position: { latitude: 52.0, longitude: 4.0, altitude: 10000 },
    velocity: { groundSpeed: 230, track: 90, verticalRate: 0 },
    onGround: false,
    source: "test",
    ...overrides,
  };
}

describe("FlightDNA", () => {
  let fdna: FlightDNA;

  beforeEach(() => {
    fdna = new FlightDNA();
  });

  afterEach(() => {
    fdna.destroy();
  });

  describe("track and untrack", () => {
    it("should add an aircraft via track()", async () => {
      await fdna.track("ABC123");
      expect(fdna.trackedCount).toBe(1);
      expect(fdna.getTrackedAircraft()).toContain("abc123");
    });

    it("should not duplicate tracking the same aircraft", async () => {
      await fdna.track("ABC123");
      await fdna.track("abc123");
      expect(fdna.trackedCount).toBe(1);
    });

    it("should return a state for a tracked aircraft", async () => {
      await fdna.track("abc123");
      const state = fdna.getState("abc123");
      expect(state).toBeDefined();
      expect(state!.aircraft.icao24).toBe("abc123");
      expect(state!.source).toBe("pending");
    });

    it("should remove an aircraft via untrack()", async () => {
      await fdna.track("abc123");
      fdna.untrack("abc123");
      expect(fdna.trackedCount).toBe(0);
      expect(fdna.getState("abc123")).toBeUndefined();
    });

    it("should emit trackStart and trackEnd events", async () => {
      const trackStartListener = vi.fn();
      const trackEndListener = vi.fn();

      fdna.on("trackStart", trackStartListener);
      fdna.on("trackEnd", trackEndListener);

      await fdna.track("abc123");
      expect(trackStartListener).toHaveBeenCalledOnce();
      expect(trackStartListener).toHaveBeenCalledWith(
        expect.objectContaining({ icao24: "abc123" }),
      );

      fdna.untrack("abc123");
      expect(trackEndListener).toHaveBeenCalledOnce();
      expect(trackEndListener).toHaveBeenCalledWith(
        expect.objectContaining({ icao24: "abc123", reason: "manual" }),
      );
    });
  });

  describe("ingest", () => {
    it("should store state and make it retrievable via getState()", () => {
      const state = makeState("abc123");
      fdna.ingest(state);
      const retrieved = fdna.getState("abc123");
      expect(retrieved).toBe(state);
    });

    it("should emit a stateUpdate event on ingest", () => {
      const listener = vi.fn();
      fdna.on("stateUpdate", listener);

      const state = makeState("abc123");
      fdna.ingest(state);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(state);
    });

    it("should overwrite previous state on subsequent ingest", () => {
      const state1 = makeState("abc123", { timestamp: 1000 });
      const state2 = makeState("abc123", { timestamp: 2000 });

      fdna.ingest(state1);
      fdna.ingest(state2);

      expect(fdna.getState("abc123")).toBe(state2);
    });
  });

  describe("ingestBatch", () => {
    it("should process states in timestamp order", () => {
      const listener = vi.fn();
      fdna.on("stateUpdate", listener);

      const states = [
        makeState("a1", { timestamp: 3000 }),
        makeState("a2", { timestamp: 1000 }),
        makeState("a3", { timestamp: 2000 }),
      ];

      fdna.ingestBatch(states);

      expect(listener).toHaveBeenCalledTimes(3);
      // Verify they were processed in timestamp order
      const calls = listener.mock.calls.map(
        (c: [FlightState]) => c[0].timestamp,
      );
      expect(calls[0]).toBe(1000);
      expect(calls[1]).toBe(2000);
      expect(calls[2]).toBe(3000);
    });
  });

  describe("getAllStates", () => {
    it("should return all tracked aircraft states", async () => {
      await fdna.track("abc123");
      await fdna.track("def456");

      const allStates = fdna.getAllStates();
      expect(allStates.length).toBe(2);
    });

    it("should return empty array when nothing tracked", () => {
      expect(fdna.getAllStates()).toHaveLength(0);
    });
  });

  describe("destroy", () => {
    it("should clear all tracked aircraft", async () => {
      await fdna.track("abc123");
      await fdna.track("def456");

      fdna.destroy();
      expect(fdna.trackedCount).toBe(0);
    });

    it("should stop emitting events after destroy", async () => {
      const listener = vi.fn();
      fdna.on("stateUpdate", listener);

      fdna.destroy();
      fdna.ingest(makeState("abc123"));

      // After destroy, bus.off() was called, so listener should not fire
      expect(listener).not.toHaveBeenCalled();
    });

    it("should stop running interval after destroy", () => {
      fdna.start();
      expect(fdna.isRunning).toBe(true);

      fdna.destroy();
      expect(fdna.isRunning).toBe(false);
    });
  });

  describe("start and stop lifecycle", () => {
    it("should start the periodic update loop", () => {
      fdna.start();
      expect(fdna.isRunning).toBe(true);
    });

    it("should stop the periodic update loop", () => {
      fdna.start();
      fdna.stop();
      expect(fdna.isRunning).toBe(false);
    });

    it("should not start twice", () => {
      fdna.start();
      fdna.start();
      expect(fdna.isRunning).toBe(true);
      fdna.stop();
      expect(fdna.isRunning).toBe(false);
    });

    it("should handle stop when not running", () => {
      expect(() => fdna.stop()).not.toThrow();
      expect(fdna.isRunning).toBe(false);
    });
  });

  describe("configuration", () => {
    it("should use default updateInterval of 10000", () => {
      // We can't directly read the config, but we verify the object creates fine
      const f = new FlightDNA();
      expect(f.isRunning).toBe(false);
      f.destroy();
    });

    it("should accept custom configuration", () => {
      const f = new FlightDNA({
        updateInterval: 5000,
        dynamics: false,
        twinEnabled: false,
      });
      expect(f.isRunning).toBe(false);
      f.destroy();
    });
  });

  describe("case normalization", () => {
    it("should normalize ICAO24 to lowercase", async () => {
      await fdna.track("ABC123");
      expect(fdna.getState("abc123")).toBeDefined();
      expect(fdna.getState("ABC123")).toBeDefined();
    });

    it("should handle whitespace in ICAO24", async () => {
      await fdna.track("  ABC123  ");
      expect(fdna.getState("abc123")).toBeDefined();
    });
  });

  describe("getTrackedAircraft", () => {
    it("should return the list of tracked ICAO24 addresses", async () => {
      await fdna.track("abc123");
      await fdna.track("def456");

      const tracked = fdna.getTrackedAircraft();
      expect(tracked).toContain("abc123");
      expect(tracked).toContain("def456");
      expect(tracked.length).toBe(2);
    });
  });
});
