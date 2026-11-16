import { describe, it, expect } from "vitest";
import type { FlightState } from "@flightdna/core";
import { JSONLExporter } from "../jsonl";

function makeStates(count: number): FlightState[] {
  const states: FlightState[] = [];
  const baseTime = 1700000000000;
  for (let i = 0; i < count; i++) {
    states.push({
      aircraft: { icao24: "abc123", callsign: "TEST1" },
      timestamp: baseTime + i * 10000,
      position: {
        latitude: 52.0 + i * 0.01,
        longitude: 4.0 + i * 0.01,
        altitude: 10000 + i * 10,
      },
      velocity: {
        groundSpeed: 230,
        track: 45,
        verticalRate: i < count / 2 ? 5 : -3,
      },
      onGround: false,
      source: "test",
    });
  }
  return states;
}

describe("JSONLExporter", () => {
  it("each line should be valid JSON", () => {
    const exporter = new JSONLExporter();
    const output = exporter.export(makeStates(3));
    const lines = output.split("\n");
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("number of lines should equal number of states", () => {
    const exporter = new JSONLExporter();
    const states = makeStates(5);
    const output = exporter.export(states);
    const lines = output.split("\n");
    expect(lines.length).toBe(5);
  });

  it("should handle NaN values by replacing with null", () => {
    const exporter = new JSONLExporter();
    const states = makeStates(1);
    states[0].velocity.groundSpeed = NaN;
    const output = exporter.export(states);
    const parsed = JSON.parse(output);
    expect(parsed.groundSpeed).toBeNull();
  });

  it("stream generator should yield one line per state", () => {
    const exporter = new JSONLExporter();
    const states = makeStates(4);
    const lines: string[] = [];
    for (const line of exporter.exportStream(states)) {
      lines.push(line);
    }
    expect(lines.length).toBe(4);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("formatLine should produce a single valid JSON string", () => {
    const exporter = new JSONLExporter();
    const states = makeStates(1);
    const line = exporter.formatLine(states[0]);
    const parsed = JSON.parse(line);
    expect(parsed.icao24).toBe("abc123");
    expect(parsed.callsign).toBe("TEST1");
    expect(typeof parsed.latitude).toBe("number");
    expect(typeof parsed.longitude).toBe("number");
  });
});
