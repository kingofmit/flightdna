import type { FlightState } from "@flightdna/core";
import type { TwinState } from "@flightdna/twin";

/**
 * A flight record for persistent storage.
 */
export interface FlightRecord {
  /** Unique record ID */
  id: string;
  /** Aircraft ICAO24 address */
  icao24: string;
  /** Callsign */
  callsign: string | null;
  /** Aircraft type designator */
  typeDesignator: string | null;
  /** Timestamp (ms since epoch) */
  timestamp: number;
  /** Latitude in degrees */
  latitude: number;
  /** Longitude in degrees */
  longitude: number;
  /** Altitude in meters MSL */
  altitude: number;
  /** Ground speed in m/s */
  groundSpeed: number;
  /** Track angle in degrees */
  track: number;
  /** Vertical rate in m/s */
  verticalRate: number;
  /** Whether on ground */
  onGround: boolean;
  /** Mach number estimate */
  mach: number | null;
  /** Flight phase */
  flightPhase: string | null;
  /** Overall health score (0-1) */
  healthScore: number | null;
  /** Number of active anomalies */
  anomalyCount: number;
  /** Data source */
  source: string;
}

/**
 * Query options for retrieving stored records.
 */
export interface StorageQuery {
  /** Filter by ICAO24 */
  icao24?: string;
  /** Filter by time range (start, ms since epoch) */
  startTime?: number;
  /** Filter by time range (end, ms since epoch) */
  endTime?: number;
  /** Filter by aircraft type */
  typeDesignator?: string;
  /** Filter by minimum altitude */
  minAltitude?: number;
  /** Maximum number of records to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort order */
  orderBy?: "timestamp_asc" | "timestamp_desc";
}

/**
 * Abstract storage backend interface.
 * Implement this to add PostgreSQL, SQLite, TimescaleDB, etc.
 */
export interface StorageBackend {
  /** Store a batch of flight records */
  insertRecords(records: FlightRecord[]): Promise<void>;
  /** Query stored records */
  queryRecords(query: StorageQuery): Promise<FlightRecord[]>;
  /** Count records matching a query */
  countRecords(query: StorageQuery): Promise<number>;
  /** Get distinct ICAO24 addresses in the store */
  getDistinctAircraft(startTime?: number, endTime?: number): Promise<string[]>;
  /** Delete records older than a timestamp */
  pruneRecords(olderThan: number): Promise<number>;
  /** Close the storage connection */
  close(): Promise<void>;
}

/**
 * Convert a FlightState + TwinState into a FlightRecord.
 */
export function toFlightRecord(
  state: FlightState,
  twinState?: TwinState,
): FlightRecord {
  const overall = twinState?.health.find(h => h.type === "overall");
  return {
    id: `${state.aircraft.icao24}-${state.timestamp}`,
    icao24: state.aircraft.icao24,
    callsign: state.aircraft.callsign ?? null,
    typeDesignator: state.aircraft.typeDesignator ?? null,
    timestamp: state.timestamp,
    latitude: state.position.latitude,
    longitude: state.position.longitude,
    altitude: state.position.altitude,
    groundSpeed: state.velocity.groundSpeed,
    track: state.velocity.track,
    verticalRate: state.velocity.verticalRate,
    onGround: state.onGround,
    mach: twinState?.performance.mach ?? null,
    flightPhase: twinState?.flightPhase ?? null,
    healthScore: overall?.value ?? null,
    anomalyCount: twinState?.anomalies.length ?? 0,
    source: state.source,
  };
}

/**
 * In-memory storage backend for testing and lightweight use.
 */
export class MemoryStorage implements StorageBackend {
  private records: FlightRecord[] = [];
  private readonly maxRecords: number;

  constructor(maxRecords: number = 100_000) {
    this.maxRecords = maxRecords;
  }

  async insertRecords(records: FlightRecord[]): Promise<void> {
    this.records.push(...records);
    // Trim if over max
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }
  }

  async queryRecords(query: StorageQuery): Promise<FlightRecord[]> {
    let results = this.records;

    if (query.icao24) {
      results = results.filter(r => r.icao24 === query.icao24!.toLowerCase());
    }
    if (query.startTime !== undefined) {
      results = results.filter(r => r.timestamp >= query.startTime!);
    }
    if (query.endTime !== undefined) {
      results = results.filter(r => r.timestamp <= query.endTime!);
    }
    if (query.typeDesignator) {
      results = results.filter(r => r.typeDesignator === query.typeDesignator);
    }
    if (query.minAltitude !== undefined) {
      results = results.filter(r => r.altitude >= query.minAltitude!);
    }

    if (query.orderBy === "timestamp_asc") {
      results = [...results].sort((a, b) => a.timestamp - b.timestamp);
    } else if (query.orderBy === "timestamp_desc") {
      results = [...results].sort((a, b) => b.timestamp - a.timestamp);
    }

    const offset = query.offset ?? 0;
    const limit = query.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  async countRecords(query: StorageQuery): Promise<number> {
    return (await this.queryRecords({ ...query, limit: undefined, offset: undefined })).length;
  }

  async getDistinctAircraft(startTime?: number, endTime?: number): Promise<string[]> {
    let records = this.records;
    if (startTime !== undefined) records = records.filter(r => r.timestamp >= startTime);
    if (endTime !== undefined) records = records.filter(r => r.timestamp <= endTime);
    return [...new Set(records.map(r => r.icao24))];
  }

  async pruneRecords(olderThan: number): Promise<number> {
    const before = this.records.length;
    this.records = this.records.filter(r => r.timestamp >= olderThan);
    return before - this.records.length;
  }

  async close(): Promise<void> {
    // No-op for memory storage
  }

  /** Get total record count (for testing) */
  get size(): number {
    return this.records.length;
  }
}

/**
 * SQL schema for PostgreSQL/TimescaleDB.
 * Users can run this to set up the database.
 */
export const SQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS flight_records (
  id TEXT PRIMARY KEY,
  icao24 TEXT NOT NULL,
  callsign TEXT,
  type_designator TEXT,
  timestamp BIGINT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude DOUBLE PRECISION NOT NULL,
  ground_speed DOUBLE PRECISION NOT NULL,
  track DOUBLE PRECISION NOT NULL,
  vertical_rate DOUBLE PRECISION NOT NULL,
  on_ground BOOLEAN NOT NULL,
  mach DOUBLE PRECISION,
  flight_phase TEXT,
  health_score DOUBLE PRECISION,
  anomaly_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flight_records_icao24 ON flight_records (icao24);
CREATE INDEX IF NOT EXISTS idx_flight_records_timestamp ON flight_records (timestamp);
CREATE INDEX IF NOT EXISTS idx_flight_records_type ON flight_records (type_designator);

-- For TimescaleDB (optional):
-- SELECT create_hypertable('flight_records', 'timestamp', chunk_time_interval => 86400000);
`;
