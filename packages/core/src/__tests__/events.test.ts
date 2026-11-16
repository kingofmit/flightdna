import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventBus } from "../events";

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe("subscribe and emit", () => {
    it("should call a listener when the subscribed event is emitted", () => {
      const listener = vi.fn();
      bus.on("stateUpdate", listener);

      const data = {
        aircraft: { icao24: "abc123" },
        timestamp: Date.now(),
        position: { latitude: 52, longitude: 4, altitude: 10000 },
        velocity: { groundSpeed: 230, track: 90, verticalRate: 0 },
        onGround: false,
        source: "test",
      };

      bus.emit("stateUpdate", data);
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(data);
    });

    it("should pass the correct data to the listener", () => {
      let received: unknown = null;
      bus.on("error", (data) => {
        received = data;
      });

      const errorData = { message: "test error", code: "ERR_TEST" };
      bus.emit("error", errorData);

      expect(received).toEqual(errorData);
    });
  });

  describe("unsubscribe", () => {
    it("should not call the listener after unsubscribing", () => {
      const listener = vi.fn();
      const unsubscribe = bus.on("stateUpdate", listener);

      const data = {
        aircraft: { icao24: "abc123" },
        timestamp: Date.now(),
        position: { latitude: 52, longitude: 4, altitude: 10000 },
        velocity: { groundSpeed: 230, track: 90, verticalRate: 0 },
        onGround: false,
        source: "test",
      };

      bus.emit("stateUpdate", data);
      expect(listener).toHaveBeenCalledOnce();

      unsubscribe();

      bus.emit("stateUpdate", data);
      expect(listener).toHaveBeenCalledOnce(); // Still 1, not 2
    });
  });

  describe("multiple listeners", () => {
    it("should call all listeners for the same event", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      bus.on("trackStart", listener1);
      bus.on("trackStart", listener2);
      bus.on("trackStart", listener3);

      const data = { icao24: "abc123", timestamp: Date.now() };
      bus.emit("trackStart", data);

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();
      expect(listener3).toHaveBeenCalledOnce();
    });

    it("should not affect listeners of different events", () => {
      const stateListener = vi.fn();
      const errorListener = vi.fn();

      bus.on("stateUpdate", stateListener);
      bus.on("error", errorListener);

      bus.emit("error", { message: "oops" });

      expect(stateListener).not.toHaveBeenCalled();
      expect(errorListener).toHaveBeenCalledOnce();
    });
  });

  describe("off (remove listeners)", () => {
    it("should remove all listeners for a specific event", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      bus.on("trackStart", listener1);
      bus.on("trackStart", listener2);

      bus.off("trackStart");

      bus.emit("trackStart", { icao24: "abc123", timestamp: Date.now() });
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it("should remove ALL listeners when called without arguments", () => {
      const stateListener = vi.fn();
      const errorListener = vi.fn();

      bus.on("stateUpdate", stateListener);
      bus.on("error", errorListener);

      bus.off();

      bus.emit("stateUpdate", {
        aircraft: { icao24: "abc123" },
        timestamp: Date.now(),
        position: { latitude: 0, longitude: 0, altitude: 0 },
        velocity: { groundSpeed: 0, track: 0, verticalRate: 0 },
        onGround: false,
        source: "test",
      });
      bus.emit("error", { message: "oops" });

      expect(stateListener).not.toHaveBeenCalled();
      expect(errorListener).not.toHaveBeenCalled();
    });
  });

  describe("error isolation", () => {
    it("should not crash other listeners if one throws", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const throwingListener = () => {
        throw new Error("boom");
      };
      const safeListener = vi.fn();

      bus.on("trackStart", throwingListener);
      bus.on("trackStart", safeListener);

      const data = { icao24: "abc123", timestamp: Date.now() };
      // Should not throw
      expect(() => bus.emit("trackStart", data)).not.toThrow();

      // The safe listener should still have been called
      expect(safeListener).toHaveBeenCalledOnce();

      // Console error should have been logged
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe("listenerCount", () => {
    it("should return 0 for an event with no listeners", () => {
      expect(bus.listenerCount("stateUpdate")).toBe(0);
    });

    it("should return the correct count after subscribing", () => {
      bus.on("stateUpdate", () => {});
      bus.on("stateUpdate", () => {});
      expect(bus.listenerCount("stateUpdate")).toBe(2);
    });

    it("should decrement after unsubscribing", () => {
      const unsub1 = bus.on("stateUpdate", () => {});
      bus.on("stateUpdate", () => {});
      expect(bus.listenerCount("stateUpdate")).toBe(2);

      unsub1();
      expect(bus.listenerCount("stateUpdate")).toBe(1);
    });
  });

  describe("emit with no subscribers", () => {
    it("should not throw when emitting with no subscribers", () => {
      expect(() =>
        bus.emit("error", { message: "no one listening" }),
      ).not.toThrow();
    });
  });
});
