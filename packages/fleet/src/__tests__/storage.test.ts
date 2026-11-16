import { describe, it, expect, beforeEach } from "vitest";
import type { FlightState } from "@flightdna/core";
import type { TwinState } from "@flightdna/twin";
import { MemoryStorage, toFlightRecord, SQL_SCHEMA } from "../storage";
import type { FlightRecord } from "../storage";

function makeFlightState(overrides: {
  icao24: string;
  timestamp?: number;
  callsign?: string;
  typeDesignator?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  groundSpeed?: number;
  track?: number;
  verticalRate?: number;
  onGround?: boolean;
  source?: string;
}): FlightState {
  return {
    aircraft: {
      icao24: overrides.icao24,
      callsign: overrides.callsign,
      typeDesignator: overrides.typeDesignator,
    },
    timestamp: overrides.timestamp ?? 1000000,
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
    onGround: overrides.onGround ?? false,
    source: overrides.source ?? "test",
  };
}

function makeRecord(overrides: Partial<FlightRecord> & { icao24: string }): FlightRecord {
  return {
    id: overrides.id ?? `${overrides.icao24}-${overrides.timestamp ?? 1000000}`,
    icao24: overrides.icao24,
    callsign: overrides.callsign ?? null,
    typeDesignator: overrides.typeDesignator ?? null,
    timestamp: overrides.timestamp ?? 1000000,
    latitude: overrides.latitude ?? 52.0,
    longitude: overrides.longitude ?? 4.0,
    altitude: overrides.altitude ?? 10000,
    groundSpeed: overrides.groundSpeed ?? 230,
    track: overrides.track ?? 90,
    verticalRate: overrides.verticalRate ?? 0,
    onGround: overrides.onGround ?? false,
    mach: overrides.mach ?? null,
    flightPhase: overrides.flightPhase ?? null,
    healthScore: overrides.healthScore ?? null,
    anomalyCount: overrides.anomalyCount ?? 0,
    source: overrides.source ?? "test",
  };
}

describe("MemoryStorage", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("insert and query by icao24", async () => {
    const recordA = makeRecord({ icao24: "abc123", timestamp: 1000 });
    const recordB = makeRecord({ icao24: "def456", timestamp: 2000 });

    await storage.insertRecords([recordA, recordB]);

    const results = await storage.queryRecords({ icao24: "abc123" });
    expect(results).toHaveLength(1);
    expect(results[0].icao24).toBe("abc123");
  });

  it("query by time range", async () => {
    const records = [
      makeRecord({ icao24: "abc123", timestamp: 1000 }),
      makeRecord({ icao24: "abc123", timestamp: 2000 }),
      makeRecord({ icao24: "abc123", timestamp: 3000 }),
      makeRecord({ icao24: "abc123", timestamp: 4000 }),
    ];

    await storage.insertRecords(records);

    const results = await storage.queryRecords({ startTime: 2000, endTime: 3000 });
    expect(results).toHaveLength(2);
    expect(results.every(r => r.timestamp >= 2000 && r.timestamp <= 3000)).toBe(true);
  });

  it("query with limit and offset", async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({ icao24: "abc123", id: `abc123-${i}`, timestamp: 1000 + i }),
    );

    await storage.insertRecords(records);

    const page1 = await storage.queryRecords({ limit: 3, offset: 0 });
    expect(page1).toHaveLength(3);

    const page2 = await storage.queryRecords({ limit: 3, offset: 3 });
    expect(page2).toHaveLength(3);
    expect(page2[0].timestamp).toBe(1003);

    const lastPage = await storage.queryRecords({ limit: 5, offset: 8 });
    expect(lastPage).toHaveLength(2);
  });

  it("order by timestamp ascending", async () => {
    const records = [
      makeRecord({ icao24: "abc123", timestamp: 3000 }),
      makeRecord({ icao24: "abc123", timestamp: 1000 }),
      makeRecord({ icao24: "abc123", timestamp: 2000 }),
    ];

    await storage.insertRecords(records);

    const results = await storage.queryRecords({ orderBy: "timestamp_asc" });
    expect(results).toHaveLength(3);
    expect(results[0].timestamp).toBe(1000);
    expect(results[1].timestamp).toBe(2000);
    expect(results[2].timestamp).toBe(3000);
  });

  it("order by timestamp descending", async () => {
    const records = [
      makeRecord({ icao24: "abc123", timestamp: 1000 }),
      makeRecord({ icao24: "abc123", timestamp: 3000 }),
      makeRecord({ icao24: "abc123", timestamp: 2000 }),
    ];

    await storage.insertRecords(records);

    const results = await storage.queryRecords({ orderBy: "timestamp_desc" });
    expect(results).toHaveLength(3);
    expect(results[0].timestamp).toBe(3000);
    expect(results[1].timestamp).toBe(2000);
    expect(results[2].timestamp).toBe(1000);
  });

  it("getDistinctAircraft returns unique ICAO24s", async () => {
    const records = [
      makeRecord({ icao24: "abc123", timestamp: 1000 }),
      makeRecord({ icao24: "abc123", timestamp: 2000 }),
      makeRecord({ icao24: "def456", timestamp: 1500 }),
      makeRecord({ icao24: "ghi789", timestamp: 3000 }),
    ];

    await storage.insertRecords(records);

    const distinct = await storage.getDistinctAircraft();
    expect(distinct).toHaveLength(3);
    expect(distinct).toContain("abc123");
    expect(distinct).toContain("def456");
    expect(distinct).toContain("ghi789");
  });

  it("pruneRecords removes old data", async () => {
    const records = [
      makeRecord({ icao24: "abc123", timestamp: 1000 }),
      makeRecord({ icao24: "abc123", timestamp: 2000 }),
      makeRecord({ icao24: "abc123", timestamp: 3000 }),
    ];

    await storage.insertRecords(records);

    const removed = await storage.pruneRecords(2500);
    expect(removed).toBe(2);
    expect(storage.size).toBe(1);

    const remaining = await storage.queryRecords({});
    expect(remaining).toHaveLength(1);
    expect(remaining[0].timestamp).toBe(3000);
  });

  it("respects maxRecords limit", async () => {
    const smallStorage = new MemoryStorage(5);
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({ icao24: "abc123", id: `abc123-${i}`, timestamp: 1000 + i }),
    );

    await smallStorage.insertRecords(records);

    expect(smallStorage.size).toBe(5);
    // Should keep the last 5 records
    const all = await smallStorage.queryRecords({});
    expect(all[0].timestamp).toBe(1005);
    expect(all[4].timestamp).toBe(1009);
  });
});

describe("toFlightRecord", () => {
  it("converts FlightState correctly", () => {
    const state = makeFlightState({
      icao24: "abc123",
      timestamp: 5000,
      callsign: "UAL123",
      typeDesignator: "B738",
      latitude: 37.7749,
      longitude: -122.4194,
      altitude: 11000,
      groundSpeed: 250,
      track: 180,
      verticalRate: 5,
      onGround: false,
      source: "opensky",
    });

    const record = toFlightRecord(state);

    expect(record.id).toBe("abc123-5000");
    expect(record.icao24).toBe("abc123");
    expect(record.callsign).toBe("UAL123");
    expect(record.typeDesignator).toBe("B738");
    expect(record.timestamp).toBe(5000);
    expect(record.latitude).toBe(37.7749);
    expect(record.longitude).toBe(-122.4194);
    expect(record.altitude).toBe(11000);
    expect(record.groundSpeed).toBe(250);
    expect(record.track).toBe(180);
    expect(record.verticalRate).toBe(5);
    expect(record.onGround).toBe(false);
    expect(record.source).toBe("opensky");
  });

  it("with TwinState includes mach, phase, health", () => {
    const state = makeFlightState({ icao24: "abc123", timestamp: 5000 });

    const twinState: TwinState = {
      icao24: "abc123",
      timestamp: 5000,
      position: { latitude: 52.0, longitude: 4.0, altitude: 10000 },
      velocity: { groundSpeed: 230, track: 90, verticalRate: 0 },
      performance: { mach: 0.78, climbRate: 2.5 },
      health: [
        { type: "overall", value: 0.92, trend: 0.01, confidence: 0.95, timestamp: 5000 },
        { type: "engine_performance", value: 0.88, trend: -0.02, confidence: 0.9, timestamp: 5000 },
      ],
      anomalies: [
        {
          id: "anom-1",
          type: "altitude_deviation",
          message: "Unusual altitude",
          severity: "warning",
          deviation: 2.5,
          detectedAt: 4000,
        },
      ],
      flightHours: 100,
      updateCount: 50,
      airborne: true,
      flightPhase: "cruise",
    };

    const record = toFlightRecord(state, twinState);

    expect(record.mach).toBe(0.78);
    expect(record.flightPhase).toBe("cruise");
    expect(record.healthScore).toBe(0.92);
    expect(record.anomalyCount).toBe(1);
  });

  it("without TwinState uses nulls", () => {
    const state = makeFlightState({ icao24: "abc123" });
    const record = toFlightRecord(state);

    expect(record.mach).toBeNull();
    expect(record.flightPhase).toBeNull();
    expect(record.healthScore).toBeNull();
    expect(record.anomalyCount).toBe(0);
  });
});

describe("SQL_SCHEMA", () => {
  it("is a non-empty string containing CREATE TABLE", () => {
    expect(typeof SQL_SCHEMA).toBe("string");
    expect(SQL_SCHEMA.length).toBeGreaterThan(0);
    expect(SQL_SCHEMA).toContain("CREATE TABLE");
    expect(SQL_SCHEMA).toContain("flight_records");
  });
});
