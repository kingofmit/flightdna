import { describe, it, expect } from "vitest";
import type { FlightState } from "@flightdna/core";
import { KMLExporter } from "../kml";

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

describe("KMLExporter", () => {
  it("should produce valid XML with KML namespace", () => {
    const exporter = new KMLExporter();
    const kml = exporter.export(makeStates(3));
    expect(kml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(kml).toContain('xmlns="http://www.opengis.net/kml/2.2"');
  });

  it("should contain flight path coordinates", () => {
    const exporter = new KMLExporter();
    const states = makeStates(3);
    const kml = exporter.export(states);
    // Coordinates should be lon,lat,alt
    expect(kml).toContain(`${states[0].position.longitude},${states[0].position.latitude},${states[0].position.altitude}`);
    expect(kml).toContain(`${states[2].position.longitude},${states[2].position.latitude},${states[2].position.altitude}`);
  });

  it("should include start and end placemarks", () => {
    const exporter = new KMLExporter();
    const kml = exporter.export(makeStates(5));
    expect(kml).toContain("<name>Start</name>");
    expect(kml).toContain("<name>End</name>");
    expect(kml).toContain("Start of track");
    expect(kml).toContain("End of track");
  });

  it("should escape XML special characters in names", () => {
    const exporter = new KMLExporter();
    const kml = exporter.export(makeStates(2), { name: 'Flight <"A&B">' });
    expect(kml).toContain("Flight &lt;&quot;A&amp;B&quot;&gt;");
    expect(kml).not.toContain('<"A&B">');
  });

  it("should handle empty states array", () => {
    const exporter = new KMLExporter();
    const kml = exporter.export([]);
    expect(kml).toContain("<kml");
    expect(kml).toContain("</kml>");
    expect(kml).toContain("<name>Flight</name>");
    // No start/end placemarks for empty array
    expect(kml).not.toContain("<name>Start</name>");
  });
});
