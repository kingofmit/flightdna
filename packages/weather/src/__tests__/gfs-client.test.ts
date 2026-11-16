import { describe, it, expect, beforeEach } from "vitest";
import { GFSClient } from "../gfs-client";
import type { WindField } from "../gfs-client";

describe("GFSClient", () => {
  let client: GFSClient;

  beforeEach(() => {
    client = new GFSClient();
  });

  describe("constructor", () => {
    it("should use default config values", () => {
      // Defaults: cacheTtl=3600000, timeout=15000
      // We can verify indirectly via cache behavior and that it constructs without error
      expect(client).toBeInstanceOf(GFSClient);
      expect(client.cacheSize).toBe(0);
    });

    it("should accept custom config", () => {
      const custom = new GFSClient({ cacheTtl: 60_000, timeout: 5_000 });
      expect(custom).toBeInstanceOf(GFSClient);
    });
  });

  describe("PRESSURE_LEVELS", () => {
    it("should have 11 entries", () => {
      expect(GFSClient.PRESSURE_LEVELS).toHaveLength(11);
    });

    it("should be in descending pressure / ascending altitude order", () => {
      const levels = GFSClient.PRESSURE_LEVELS;
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i].hPa).toBeLessThan(levels[i - 1].hPa);
        expect(levels[i].altitudeM).toBeGreaterThan(levels[i - 1].altitudeM);
      }
    });
  });

  describe("interpolateWind", () => {
    function makeField(entries: Array<{ hPa: number; u: number; v: number }>): WindField {
      const field: WindField = {
        u: new Map(),
        v: new Map(),
        latitude: 40,
        longitude: -74,
        validTime: Date.now(),
      };
      for (const e of entries) {
        field.u.set(e.hPa, e.u);
        field.v.set(e.hPa, e.v);
      }
      return field;
    }

    it("should linearly interpolate between two pressure levels", () => {
      // 1000 hPa (100m): u=10, v=0
      // 925 hPa (750m): u=20, v=0
      const field = makeField([
        { hPa: 1000, u: 10, v: 0 },
        { hPa: 925, u: 20, v: 0 },
      ]);

      // Midpoint: 425m -> frac = (425 - 100) / (750 - 100) = 325/650 = 0.5
      const wind = client.interpolateWind(field, 425);
      expect(wind.eastComponent).toBeCloseTo(15, 5);
      expect(wind.northComponent).toBeCloseTo(0, 5);
      expect(wind.speed).toBeCloseTo(15, 5);
    });

    it("should return exact level values at level altitude", () => {
      // At exactly 100m (1000 hPa level)
      const field = makeField([
        { hPa: 1000, u: 5, v: -8 },
        { hPa: 925, u: 12, v: -3 },
      ]);

      const wind = client.interpolateWind(field, 100);
      expect(wind.eastComponent).toBeCloseTo(5, 5);
      expect(wind.northComponent).toBeCloseTo(-8, 5);
    });

    it("should return upper level values at upper level altitude", () => {
      const field = makeField([
        { hPa: 1000, u: 5, v: -8 },
        { hPa: 925, u: 12, v: -3 },
      ]);

      const wind = client.interpolateWind(field, 750);
      expect(wind.eastComponent).toBeCloseTo(12, 5);
      expect(wind.northComponent).toBeCloseTo(-3, 5);
    });

    it("should compute correct wind direction from U/V components", () => {
      // Pure westerly wind: u > 0, v = 0 -> wind blows east, FROM west = 270 degrees
      const field = makeField([
        { hPa: 1000, u: 10, v: 0 },
        { hPa: 925, u: 10, v: 0 },
      ]);
      const wind = client.interpolateWind(field, 100);
      expect(wind.direction).toBeCloseTo(270, 0);
      expect(wind.speed).toBeCloseTo(10, 5);
    });

    it("should compute correct direction for northerly wind", () => {
      // Wind from north: air moves south -> v < 0
      // direction should be 0 (from north)
      const field = makeField([
        { hPa: 1000, u: 0, v: -10 },
        { hPa: 925, u: 0, v: -10 },
      ]);
      const wind = client.interpolateWind(field, 100);
      expect(wind.direction).toBeCloseTo(0, 0);
    });

    it("should compute correct direction for southerly wind", () => {
      // Wind from south: air moves north -> v > 0
      // direction should be 180 (from south)
      const field = makeField([
        { hPa: 1000, u: 0, v: 10 },
        { hPa: 925, u: 0, v: 10 },
      ]);
      const wind = client.interpolateWind(field, 100);
      expect(wind.direction).toBeCloseTo(180, 0);
    });

    it("should compute correct direction for easterly wind", () => {
      // Wind from east: air moves west -> u < 0
      // direction should be 90 (from east)
      const field = makeField([
        { hPa: 1000, u: -10, v: 0 },
        { hPa: 925, u: -10, v: 0 },
      ]);
      const wind = client.interpolateWind(field, 100);
      expect(wind.direction).toBeCloseTo(90, 0);
    });

    it("should handle altitude below lowest level", () => {
      // Below 100m -> uses first two levels, frac clamps via the loop not finding a match
      const field = makeField([
        { hPa: 1000, u: 5, v: 5 },
        { hPa: 925, u: 10, v: 10 },
        { hPa: 850, u: 15, v: 15 },
      ]);
      // At 0m, lower=levels[0] (100m), upper=levels[last] (16200m)
      // but the loop won't match so it uses defaults: lower=levels[0], upper=levels[last]
      // frac = (0 - 100) / (16200 - 100) = negative, but altitude is below
      const wind = client.interpolateWind(field, 50);
      // frac = (50 - 100) / (16200 - 100) which is slightly negative
      // u = 5 + (-0.003)(0 - 5) ≈ 5, v similarly
      expect(Number.isFinite(wind.speed)).toBe(true);
    });
  });

  describe("parseGrADSAscii", () => {
    it("should extract numbers from comma-separated data lines", () => {
      const text = [
        "ugrdprs, [1][11][1][1]",
        "",
        "3.5, 4.2, -1.8, 0.0, 7.6, 2.3, -5.1, 8.9, 10.2, -3.4, 6.7",
        "",
      ].join("\n");
      const values = client.parseGrADSAscii(text);
      expect(values).toEqual([3.5, 4.2, -1.8, 0.0, 7.6, 2.3, -5.1, 8.9, 10.2, -3.4, 6.7]);
    });

    it("should skip header lines with non-numeric characters", () => {
      const text = [
        "ugrdprs, [1][11][1][1]",
        "time, lev, lat, lon",
        "5.0, 10.0",
        "some text here",
        "15.0, 20.0",
      ].join("\n");
      const values = client.parseGrADSAscii(text);
      expect(values).toEqual([5.0, 10.0, 15.0, 20.0]);
    });

    it("should handle empty input", () => {
      expect(client.parseGrADSAscii("")).toEqual([]);
    });

    it("should handle scientific notation", () => {
      const text = "1.5e2, -3.2e-1, 4.0E1\n";
      const values = client.parseGrADSAscii(text);
      expect(values).toEqual([150, -0.32, 40]);
    });

    it("should handle multiple data lines", () => {
      const text = [
        "header info",
        "1.0, 2.0, 3.0",
        "4.0, 5.0, 6.0",
      ].join("\n");
      const values = client.parseGrADSAscii(text);
      expect(values).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    });
  });

  describe("cache behavior", () => {
    it("should start with empty cache", () => {
      expect(client.cacheSize).toBe(0);
    });

    it("clearCache should empty the cache", () => {
      // We can't easily populate the cache without HTTP calls,
      // but we can verify clearCache works on an empty cache
      client.clearCache();
      expect(client.cacheSize).toBe(0);
    });

    it("cacheSize should reflect cached entries after manual population", () => {
      // Access the private cache via type assertion to test cache logic
      const clientAny = client as unknown as {
        cache: Map<string, { data: WindField; fetchedAt: number }>;
        config: { cacheTtl: number };
      };

      const mockField: WindField = {
        u: new Map([[1000, 5]]),
        v: new Map([[1000, 3]]),
        latitude: 40,
        longitude: -74,
        validTime: Date.now(),
      };

      clientAny.cache.set("40,-74", { data: mockField, fetchedAt: Date.now() });
      expect(client.cacheSize).toBe(1);

      client.clearCache();
      expect(client.cacheSize).toBe(0);
    });

    it("should return cached data for the same grid point", async () => {
      // Manually populate cache, then call fetchWindField to verify it returns cached data
      const clientAny = client as unknown as {
        cache: Map<string, { data: WindField; fetchedAt: number }>;
      };

      const mockField: WindField = {
        u: new Map([[1000, 5], [925, 10]]),
        v: new Map([[1000, 3], [925, 7]]),
        latitude: 40,
        longitude: -74,
        validTime: Date.now(),
      };

      // 40.0, -74.0 snaps to gridLat=40, gridLon=286 (360-74)
      const gridLon = ((Math.round(-74 * 4) / 4) + 360) % 360;
      const cacheKey = `40,${gridLon}`;
      clientAny.cache.set(cacheKey, { data: mockField, fetchedAt: Date.now() });

      const result = await client.fetchWindField(40, -74);
      expect(result).toBe(mockField);
    });

    it("should not return expired cache entries", async () => {
      const shortTtlClient = new GFSClient({ cacheTtl: 1, timeout: 100 });
      const clientAny = shortTtlClient as unknown as {
        cache: Map<string, { data: WindField; fetchedAt: number }>;
      };

      const mockField: WindField = {
        u: new Map([[1000, 5]]),
        v: new Map([[1000, 3]]),
        latitude: 40,
        longitude: -74,
        validTime: Date.now(),
      };

      const gridLon = ((Math.round(-74 * 4) / 4) + 360) % 360;
      const cacheKey = `40,${gridLon}`;
      // Set fetchedAt in the past so TTL has expired
      clientAny.cache.set(cacheKey, { data: mockField, fetchedAt: Date.now() - 1000 });

      // This will try to fetch from NOMADS (which will fail/timeout), returning null
      const result = await shortTtlClient.fetchWindField(40, -74);
      expect(result).toBeNull();
    });
  });
});
