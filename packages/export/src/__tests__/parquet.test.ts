import { describe, it, expect } from "vitest";
import type { FlightState } from "@flightdna/core";
import { ColumnarExporter } from "../parquet";

function makeState(overrides: Partial<{
  icao24: string;
  callsign: string | undefined;
  timestamp: number;
  latitude: number;
  longitude: number;
  altitude: number;
  groundSpeed: number;
  track: number;
  verticalRate: number;
  onGround: boolean;
}> = {}): FlightState {
  return {
    aircraft: {
      icao24: overrides.icao24 ?? "abc123",
      callsign: overrides.callsign,
    },
    timestamp: overrides.timestamp ?? 1700000000000,
    position: {
      latitude: overrides.latitude ?? 52.0,
      longitude: overrides.longitude ?? 4.0,
      altitude: overrides.altitude ?? 10000,
    },
    velocity: {
      groundSpeed: overrides.groundSpeed ?? 230,
      track: overrides.track ?? 45,
      verticalRate: overrides.verticalRate ?? 5,
    },
    onGround: overrides.onGround ?? false,
    source: "test",
  };
}

function makeStates(count: number): FlightState[] {
  const states: FlightState[] = [];
  const baseTime = 1700000000000;
  for (let i = 0; i < count; i++) {
    states.push(
      makeState({
        callsign: "TEST1",
        timestamp: baseTime + i * 10000,
        latitude: 52.0 + i * 0.01,
        longitude: 4.0 + i * 0.01,
        altitude: 10000 + i * 10,
        groundSpeed: 230 + i,
        track: 45,
        verticalRate: i < count / 2 ? 5 : -3,
      }),
    );
  }
  return states;
}

describe("ColumnarExporter", () => {
  const exporter = new ColumnarExporter();

  describe("toColumnar", () => {
    it("should produce correct number of rows", () => {
      const data = exporter.toColumnar(makeStates(5));
      expect(data.length).toBe(5);
      expect(data.columns.timestamp.length).toBe(5);
      expect(data.columns.icao24.length).toBe(5);
      expect(data.columns.latitude.length).toBe(5);
    });

    it("should have correct Float64Array values", () => {
      const states = makeStates(3);
      const data = exporter.toColumnar(states);

      expect(data.columns.timestamp[0]).toBe(1700000000000);
      expect(data.columns.timestamp[1]).toBe(1700000010000);
      expect(data.columns.timestamp[2]).toBe(1700000020000);

      expect(data.columns.latitude[0]).toBe(52.0);
      expect(data.columns.latitude[1]).toBeCloseTo(52.01);
      expect(data.columns.latitude[2]).toBeCloseTo(52.02);

      expect(data.columns.longitude[0]).toBe(4.0);
      expect(data.columns.altitude[0]).toBe(10000);
      expect(data.columns.altitude[1]).toBe(10010);

      expect(data.columns.groundSpeed[0]).toBe(230);
      expect(data.columns.groundSpeed[1]).toBe(231);

      expect(data.columns.track[0]).toBe(45);
      expect(data.columns.verticalRate[0]).toBe(5);
    });

    it("should have correct string array values", () => {
      const data = exporter.toColumnar(makeStates(2));
      expect(data.columns.icao24[0]).toBe("abc123");
      expect(data.columns.icao24[1]).toBe("abc123");
      expect(data.columns.callsign[0]).toBe("TEST1");
      expect(data.columns.callsign[1]).toBe("TEST1");
    });

    it("should preserve null callsigns", () => {
      const states = [
        makeState({ callsign: "CALL1" }),
        makeState({ callsign: undefined }),
        makeState({ callsign: "CALL2" }),
      ];
      const data = exporter.toColumnar(states);
      expect(data.columns.callsign[0]).toBe("CALL1");
      expect(data.columns.callsign[1]).toBeNull();
      expect(data.columns.callsign[2]).toBe("CALL2");
    });

    it("should encode onGround as Uint8Array with 0/1 values", () => {
      const states = [
        makeState({ onGround: true }),
        makeState({ onGround: false }),
        makeState({ onGround: true }),
      ];
      const data = exporter.toColumnar(states);
      expect(data.columns.onGround).toBeInstanceOf(Uint8Array);
      expect(data.columns.onGround[0]).toBe(1);
      expect(data.columns.onGround[1]).toBe(0);
      expect(data.columns.onGround[2]).toBe(1);
    });

    it("should have correct schema types", () => {
      const data = exporter.toColumnar(makeStates(1));
      const schemaMap = new Map(data.schema.map((s) => [s.name, s.type]));

      expect(schemaMap.get("timestamp")).toBe("float64");
      expect(schemaMap.get("icao24")).toBe("string");
      expect(schemaMap.get("callsign")).toBe("string_nullable");
      expect(schemaMap.get("latitude")).toBe("float64");
      expect(schemaMap.get("longitude")).toBe("float64");
      expect(schemaMap.get("altitude")).toBe("float64");
      expect(schemaMap.get("groundSpeed")).toBe("float64");
      expect(schemaMap.get("track")).toBe("float64");
      expect(schemaMap.get("verticalRate")).toBe("float64");
      expect(schemaMap.get("onGround")).toBe("uint8");
      expect(data.schema.length).toBe(10);
    });

    it("should produce length=0 for empty states array", () => {
      const data = exporter.toColumnar([]);
      expect(data.length).toBe(0);
      expect(data.columns.timestamp.length).toBe(0);
      expect(data.columns.icao24.length).toBe(0);
      expect(data.columns.callsign.length).toBe(0);
      expect(data.columns.latitude.length).toBe(0);
      expect(data.columns.onGround.length).toBe(0);
    });
  });

  describe("stats", () => {
    it("should return valid min/max/mean for numeric columns", () => {
      const states = [
        makeState({ altitude: 5000, groundSpeed: 100, latitude: 50.0 }),
        makeState({ altitude: 15000, groundSpeed: 300, latitude: 55.0 }),
        makeState({ altitude: 10000, groundSpeed: 200, latitude: 52.5 }),
      ];
      const data = exporter.toColumnar(states);
      const s = exporter.stats(data);

      expect(s.altitude.min).toBe(5000);
      expect(s.altitude.max).toBe(15000);
      expect(s.altitude.mean).toBe(10000);
      expect(s.altitude.nullCount).toBe(0);

      expect(s.groundSpeed.min).toBe(100);
      expect(s.groundSpeed.max).toBe(300);
      expect(s.groundSpeed.mean).toBe(200);

      expect(s.latitude.min).toBe(50.0);
      expect(s.latitude.max).toBe(55.0);
      expect(s.latitude.mean).toBeCloseTo(52.5);
    });

    it("should return stats for all float64 columns", () => {
      const data = exporter.toColumnar(makeStates(3));
      const s = exporter.stats(data);

      const expectedFloatCols = [
        "timestamp",
        "latitude",
        "longitude",
        "altitude",
        "groundSpeed",
        "track",
        "verticalRate",
      ];
      for (const col of expectedFloatCols) {
        expect(s[col]).toBeDefined();
        expect(typeof s[col].min).toBe("number");
        expect(typeof s[col].max).toBe("number");
        expect(typeof s[col].mean).toBe("number");
      }
    });

    it("should handle empty data", () => {
      const data = exporter.toColumnar([]);
      const s = exporter.stats(data);
      // For empty arrays, min=Infinity, max=-Infinity, mean=0
      expect(s.altitude.min).toBe(Infinity);
      expect(s.altitude.max).toBe(-Infinity);
      expect(s.altitude.mean).toBe(0);
    });
  });

  describe("toNDJSON", () => {
    it("should produce one JSON line per state", () => {
      const ndjson = exporter.toNDJSON(makeStates(3));
      const lines = ndjson.split("\n");
      expect(lines.length).toBe(3);
      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed.icao24).toBe("abc123");
        expect(typeof parsed.timestamp).toBe("number");
        expect(typeof parsed.latitude).toBe("number");
      }
    });

    it("should produce empty string for empty states", () => {
      const ndjson = exporter.toNDJSON([]);
      expect(ndjson).toBe("");
    });

    it("should include null for missing callsigns", () => {
      const ndjson = exporter.toNDJSON([makeState({ callsign: undefined })]);
      const parsed = JSON.parse(ndjson);
      expect(parsed.callsign).toBeNull();
    });
  });
});
