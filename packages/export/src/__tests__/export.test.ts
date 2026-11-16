import { describe, it, expect } from "vitest";
import type { FlightState } from "@flightdna/core";
import { CSVExporter } from "../csv";
import { JSONExporter } from "../json";
import { FlightReporter } from "../reporter";

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

describe("CSVExporter", () => {
  it("should export states to CSV with headers", () => {
    const exporter = new CSVExporter();
    const csv = exporter.export(makeStates(3));
    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(4); // header + 3 data rows
    expect(lines[0]).toContain("timestamp");
    expect(lines[0]).toContain("icao24");
    expect(lines[1]).toContain("abc123");
  });

  it("should export without headers when configured", () => {
    const exporter = new CSVExporter({ headers: false });
    const csv = exporter.export(makeStates(2));
    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("abc123");
  });

  it("should handle empty states array", () => {
    const exporter = new CSVExporter();
    const csv = exporter.export([]);
    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(1); // header only
  });

  it("should use custom delimiter", () => {
    const exporter = new CSVExporter({ delimiter: ";" });
    const csv = exporter.export(makeStates(1));
    expect(csv).toContain(";");
  });

  it("should escape fields containing the delimiter", () => {
    const states = makeStates(1);
    states[0].aircraft.callsign = "TEST,ONE";
    const exporter = new CSVExporter({ fields: ["callsign", "icao24"] });
    const csv = exporter.export(states);
    const lines = csv.split("\n");
    // The callsign field should be quoted because it contains a comma
    expect(lines[1]).toContain('"TEST,ONE"');
  });

  it("should escape fields containing double quotes", () => {
    const states = makeStates(1);
    states[0].aircraft.callsign = 'TEST"Q';
    const exporter = new CSVExporter({ fields: ["callsign", "icao24"] });
    const csv = exporter.export(states);
    const lines = csv.split("\n");
    // Double quotes inside field should be doubled and field wrapped
    expect(lines[1]).toContain('"TEST""Q"');
  });

  it("should escape fields containing newlines", () => {
    const states = makeStates(1);
    states[0].aircraft.callsign = "TEST\nNEW";
    const exporter = new CSVExporter({ fields: ["callsign", "icao24"] });
    const csv = exporter.export(states);
    // The field with newline should be quoted
    expect(csv).toContain('"TEST\nNEW"');
  });
});

describe("JSONExporter", () => {
  it("should export states to valid JSON", () => {
    const exporter = new JSONExporter();
    const json = exporter.export(makeStates(3));
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].icao24).toBe("abc123");
  });

  it("should export GeoJSON FeatureCollection", () => {
    const exporter = new JSONExporter();
    const geojson = exporter.exportGeoJSON(makeStates(3));
    const parsed = JSON.parse(geojson);
    expect(parsed.type).toBe("FeatureCollection");
    expect(parsed.features).toHaveLength(3);
    expect(parsed.features[0].type).toBe("Feature");
    expect(parsed.features[0].geometry.type).toBe("Point");
    expect(parsed.features[0].geometry.coordinates).toHaveLength(3); // lon, lat, alt
  });

  it("should export trajectory as GeoJSON LineString", () => {
    const exporter = new JSONExporter();
    const trajectory = exporter.exportTrajectory(makeStates(5));
    const parsed = JSON.parse(trajectory);
    expect(parsed.type).toBe("FeatureCollection");
    expect(parsed.features).toHaveLength(1);
    expect(parsed.features[0].geometry.type).toBe("LineString");
    expect(parsed.features[0].geometry.coordinates).toHaveLength(5);
  });

  it("should pretty-print when configured", () => {
    const exporter = new JSONExporter({ prettyPrint: true });
    const json = exporter.export(makeStates(1));
    expect(json).toContain("\n");
  });

  it("should replace NaN values with null in export", () => {
    const states = makeStates(1);
    states[0].velocity.groundSpeed = NaN;
    const exporter = new JSONExporter();
    const json = exporter.export(states);
    const parsed = JSON.parse(json);
    expect(parsed[0].groundSpeed).toBeNull();
  });

  it("should replace Infinity values with null in export", () => {
    const states = makeStates(1);
    states[0].velocity.groundSpeed = Infinity;
    const exporter = new JSONExporter();
    const json = exporter.export(states);
    const parsed = JSON.parse(json);
    expect(parsed[0].groundSpeed).toBeNull();
  });

  it("should replace NaN values with null in GeoJSON export", () => {
    const states = makeStates(1);
    states[0].velocity.groundSpeed = NaN;
    const exporter = new JSONExporter();
    const geojson = exporter.exportGeoJSON(states);
    const parsed = JSON.parse(geojson);
    expect(parsed.features[0].properties.groundSpeed).toBeNull();
  });
});

describe("FlightReporter", () => {
  const reporter = new FlightReporter();

  it("should generate a flight summary", () => {
    const summary = reporter.generateSummary(makeStates(20));
    expect(summary.icao24).toBe("abc123");
    expect(summary.callsign).toBe("TEST1");
    expect(summary.maxAltitude).toBeGreaterThan(10000);
    expect(summary.maxGroundSpeed).toBe(230);
    expect(summary.dataPoints).toBe(20);
    expect(summary.duration).toBeGreaterThan(0);
    expect(summary.totalDistance).toBeGreaterThan(0);
  });

  it("should format summary as text", () => {
    const summary = reporter.generateSummary(makeStates(10));
    const text = reporter.formatSummaryText(summary);
    expect(text).toContain("abc123");
    expect(text).toContain("TEST1");
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(50);
  });

  it("should throw on empty states", () => {
    expect(() => reporter.generateSummary([])).toThrow();
  });

  it("should generate a performance report", () => {
    const report = reporter.generatePerformanceReport(makeStates(20));
    expect(report.altitudeProfile).toHaveLength(20);
    expect(report.speedProfile).toHaveLength(20);
    expect(report.verticalRateProfile).toHaveLength(20);
  });
});
