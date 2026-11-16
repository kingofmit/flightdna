import type { Wind } from "./types";

export interface GFSConfig {
  /** Cache TTL in milliseconds (default: 3600000 = 1 hour) */
  cacheTtl?: number;
  /** Request timeout in milliseconds (default: 15000) */
  timeout?: number;
}

export interface WindField {
  /** U-component (east-west) of wind in m/s at each pressure level */
  u: Map<number, number>; // pressure_hPa -> u_ms
  /** V-component (north-south) of wind in m/s at each pressure level */
  v: Map<number, number>; // pressure_hPa -> v_ms
  /** Latitude of this grid point */
  latitude: number;
  /** Longitude of this grid point */
  longitude: number;
  /** Forecast valid time */
  validTime: number;
}

/**
 * Client for GFS (Global Forecast System) upper-air wind data.
 *
 * Fetches wind speed and direction at standard pressure levels
 * from NOAA's NOMADS server, providing full 3D wind profiles
 * that are far more accurate than surface METAR extrapolation.
 *
 * Standard pressure levels (hPa): 1000, 925, 850, 700, 500, 400, 300, 250, 200, 150, 100
 * Approximate altitudes (m):       100, 750, 1500, 3000, 5500, 7000, 9000, 10000, 12000, 14000, 16000
 */
export class GFSClient {
  private readonly config: Required<GFSConfig>;
  private cache = new Map<string, { data: WindField; fetchedAt: number }>();

  /** Standard pressure levels in hPa and their approximate altitudes in meters */
  static readonly PRESSURE_LEVELS: ReadonlyArray<{ hPa: number; altitudeM: number }> = [
    { hPa: 1000, altitudeM: 100 },
    { hPa: 925, altitudeM: 750 },
    { hPa: 850, altitudeM: 1500 },
    { hPa: 700, altitudeM: 3000 },
    { hPa: 500, altitudeM: 5500 },
    { hPa: 400, altitudeM: 7000 },
    { hPa: 300, altitudeM: 9200 },
    { hPa: 250, altitudeM: 10400 },
    { hPa: 200, altitudeM: 11800 },
    { hPa: 150, altitudeM: 13600 },
    { hPa: 100, altitudeM: 16200 },
  ];

  constructor(config: GFSConfig = {}) {
    this.config = {
      cacheTtl: config.cacheTtl ?? 3_600_000,
      timeout: config.timeout ?? 15_000,
    };
  }

  /**
   * Get wind at a specific position and altitude by interpolating
   * from the nearest GFS grid point and pressure levels.
   */
  async getWind(latitude: number, longitude: number, altitudeM: number): Promise<Wind | null> {
    const field = await this.fetchWindField(latitude, longitude);
    if (!field) return null;
    return this.interpolateWind(field, altitudeM);
  }

  /**
   * Fetch wind field for the nearest GFS grid point.
   * Uses NOAA NOMADS GrADS Data Server.
   */
  async fetchWindField(latitude: number, longitude: number): Promise<WindField | null> {
    // Snap to nearest 0.25 degree grid point
    const gridLat = Math.round(latitude * 4) / 4;
    const gridLon = ((Math.round(longitude * 4) / 4) + 360) % 360; // GFS uses 0-360

    const cacheKey = `${gridLat},${gridLon}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.config.cacheTtl) {
      return cached.data;
    }

    try {
      // Determine latest available GFS cycle
      const now = new Date();
      const utcHour = now.getUTCHours();
      // GFS runs at 00, 06, 12, 18 UTC; data available ~4h after
      const cycle = Math.floor(((utcHour - 4 + 24) % 24) / 6) * 6;
      const date = new Date(now);
      if (utcHour < 4) date.setUTCDate(date.getUTCDate() - 1);
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
      const cycleStr = String(cycle).padStart(2, "0");

      // Build NOMADS GrADS ASCII endpoint URLs
      const baseUrl = `https://nomads.ncep.noaa.gov/dods/gfs_0p25/gfs${dateStr}/gfs_0p25_${cycleStr}z`;

      // Convert grid coordinates to indices
      // GFS 0.25 degree grid: lat from 90 to -90 (721 points), lon from 0 to 359.75 (1440 points)
      const latIdx = Math.round((90 - gridLat) / 0.25);
      const lonIdx = Math.round(gridLon / 0.25);

      // Fetch U-component (ugrdprs) and V-component (vgrdprs) at all pressure levels
      // time[0] = analysis (most recent), levels [0:10] = all 11 standard levels
      const uUrl = `${baseUrl}.ascii?ugrdprs[0][0:10][${latIdx}][${lonIdx}]`;
      const vUrl = `${baseUrl}.ascii?vgrdprs[0][0:10][${latIdx}][${lonIdx}]`;

      const [uResponse, vResponse] = await Promise.all([
        fetch(uUrl, { signal: AbortSignal.timeout(this.config.timeout) }),
        fetch(vUrl, { signal: AbortSignal.timeout(this.config.timeout) }),
      ]);

      if (!uResponse.ok || !vResponse.ok) return null;

      const uText = await uResponse.text();
      const vText = await vResponse.text();

      const uValues = this.parseGrADSAscii(uText);
      const vValues = this.parseGrADSAscii(vText);

      if (uValues.length === 0 || vValues.length === 0) return null;

      const field: WindField = {
        u: new Map(),
        v: new Map(),
        latitude: gridLat,
        longitude: gridLon > 180 ? gridLon - 360 : gridLon,
        validTime: Date.now(),
      };

      const levels = GFSClient.PRESSURE_LEVELS;
      for (let i = 0; i < Math.min(levels.length, uValues.length, vValues.length); i++) {
        field.u.set(levels[i].hPa, uValues[i]);
        field.v.set(levels[i].hPa, vValues[i]);
      }

      this.cache.set(cacheKey, { data: field, fetchedAt: Date.now() });
      return field;
    } catch {
      return null;
    }
  }

  /**
   * Interpolate wind at a specific altitude from pressure-level data.
   */
  interpolateWind(field: WindField, altitudeM: number): Wind {
    const levels = GFSClient.PRESSURE_LEVELS;

    // Find bounding pressure levels
    let lower = levels[0];
    let upper = levels[levels.length - 1];

    for (let i = 0; i < levels.length - 1; i++) {
      if (altitudeM >= levels[i].altitudeM && altitudeM <= levels[i + 1].altitudeM) {
        lower = levels[i];
        upper = levels[i + 1];
        break;
      }
    }

    // Linear interpolation factor
    const range = upper.altitudeM - lower.altitudeM;
    const frac = range > 0 ? (altitudeM - lower.altitudeM) / range : 0;

    const uLow = field.u.get(lower.hPa) ?? 0;
    const uHigh = field.u.get(upper.hPa) ?? 0;
    const vLow = field.v.get(lower.hPa) ?? 0;
    const vHigh = field.v.get(upper.hPa) ?? 0;

    const u = uLow + frac * (uHigh - uLow); // east component
    const v = vLow + frac * (vHigh - vLow); // north component

    const speed = Math.sqrt(u * u + v * v);
    // Meteorological convention: direction wind is FROM
    let direction = (Math.atan2(-u, -v) * 180) / Math.PI;
    if (direction < 0) direction += 360;

    return {
      speed,
      direction,
      northComponent: v,
      eastComponent: u,
    };
  }

  /**
   * Parse GrADS ASCII output format.
   * Format is comma-separated values after header lines.
   */
  parseGrADSAscii(text: string): number[] {
    const values: number[] = [];
    const lines = text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      // Data lines contain comma-separated numbers
      if (trimmed && /^[\d.\-eE,\s]+$/.test(trimmed)) {
        const parts = trimmed.split(",").map((s) => parseFloat(s.trim()));
        for (const val of parts) {
          if (Number.isFinite(val)) values.push(val);
        }
      }
    }
    return values;
  }

  /**
   * Clear the wind field cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size.
   */
  get cacheSize(): number {
    return this.cache.size;
  }
}
