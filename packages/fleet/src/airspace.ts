/**
 * Airspace awareness module.
 *
 * Provides basic ICAO airspace classification and FIR/TMA/CTR awareness
 * using a simplified circular-zone model. Real airspace boundaries are
 * polygonal (AIXM), but circles centered on major control facilities give
 * a useful first-order approximation for situational awareness.
 */

import type { Position } from "@flightdna/core";

// ── Types ──────────────────────────────────────────────────────────────────

export type AirspaceClass = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export interface AirspaceZone {
  /** Zone identifier */
  id: string;
  /** Name */
  name: string;
  /** Airspace classification (ICAO) */
  classification: AirspaceClass;
  /** Type of airspace */
  type: "FIR" | "TMA" | "CTR" | "restricted" | "prohibited" | "danger" | "other";
  /** Lower altitude limit in meters MSL (-1 = surface) */
  lowerAlt: number;
  /** Upper altitude limit in meters MSL (-1 = unlimited) */
  upperAlt: number;
  /** Center point latitude */
  centerLat: number;
  /** Center point longitude */
  centerLon: number;
  /** Approximate radius in meters (simplified circular model) */
  radius: number;
  /** Country code (ISO 3166-1 alpha-2) */
  country: string;
}

// ── Haversine helper ───────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance between two lat/lon pairs, in meters.
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Airspace zone database ─────────────────────────────────────────────────

/**
 * Major FIRs, TMAs, CTRs, and special-use airspace worldwide.
 * Simplified as circular zones centered on major airports/control centers.
 * This is an approximation — real airspace boundaries are polygonal.
 */
const AIRSPACE_ZONES: AirspaceZone[] = [
  // ── TMAs (Terminal Maneuvering Areas) — ~30nm / 55 km radius ───────────
  // Europe
  {
    id: "EGTT-TMA",
    name: "London TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: 750,
    upperAlt: 7620,
    centerLat: 51.4700,
    centerLon: -0.4543,
    radius: 55_000,
    country: "GB",
  },
  {
    id: "LFFF-TMA",
    name: "Paris TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: 450,
    upperAlt: 5790,
    centerLat: 49.0097,
    centerLon: 2.5479,
    radius: 55_000,
    country: "FR",
  },
  {
    id: "EDFF-TMA",
    name: "Frankfurt TMA",
    classification: "C",
    type: "TMA",
    lowerAlt: 300,
    upperAlt: 7620,
    centerLat: 50.0333,
    centerLon: 8.5706,
    radius: 55_000,
    country: "DE",
  },
  {
    id: "EHAA-TMA",
    name: "Amsterdam TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: 370,
    upperAlt: 6600,
    centerLat: 52.3086,
    centerLon: 4.7639,
    radius: 55_000,
    country: "NL",
  },
  {
    id: "LEMD-TMA",
    name: "Madrid TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: 600,
    upperAlt: 7620,
    centerLat: 40.4719,
    centerLon: -3.5626,
    radius: 55_000,
    country: "ES",
  },
  {
    id: "LIRF-TMA",
    name: "Rome TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: 300,
    upperAlt: 6100,
    centerLat: 41.8003,
    centerLon: 12.2389,
    radius: 55_000,
    country: "IT",
  },
  {
    id: "LSZH-TMA",
    name: "Zurich TMA",
    classification: "C",
    type: "TMA",
    lowerAlt: 600,
    upperAlt: 6100,
    centerLat: 47.4647,
    centerLon: 8.5492,
    radius: 45_000,
    country: "CH",
  },
  {
    id: "EKCH-TMA",
    name: "Copenhagen TMA",
    classification: "C",
    type: "TMA",
    lowerAlt: 300,
    upperAlt: 6100,
    centerLat: 55.6180,
    centerLon: 12.6508,
    radius: 45_000,
    country: "DK",
  },
  // North America
  {
    id: "KZNY-TMA",
    name: "New York TMA",
    classification: "B",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7000,
    centerLat: 40.6413,
    centerLon: -73.7781,
    radius: 55_000,
    country: "US",
  },
  {
    id: "KZLA-TMA",
    name: "Los Angeles TMA",
    classification: "B",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7000,
    centerLat: 33.9425,
    centerLon: -118.4081,
    radius: 55_000,
    country: "US",
  },
  {
    id: "KZAU-TMA",
    name: "Chicago TMA",
    classification: "B",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7000,
    centerLat: 41.9742,
    centerLon: -87.9073,
    radius: 55_000,
    country: "US",
  },
  {
    id: "KZTL-TMA",
    name: "Atlanta TMA",
    classification: "B",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7000,
    centerLat: 33.6407,
    centerLon: -84.4277,
    radius: 55_000,
    country: "US",
  },
  {
    id: "KZDFW-TMA",
    name: "Dallas-Fort Worth TMA",
    classification: "B",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7000,
    centerLat: 32.8998,
    centerLon: -97.0403,
    radius: 55_000,
    country: "US",
  },
  {
    id: "KZDEN-TMA",
    name: "Denver TMA",
    classification: "B",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7000,
    centerLat: 39.8561,
    centerLon: -104.6737,
    radius: 55_000,
    country: "US",
  },
  {
    id: "CYYZ-TMA",
    name: "Toronto TMA",
    classification: "B",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7000,
    centerLat: 43.6777,
    centerLon: -79.6248,
    radius: 55_000,
    country: "CA",
  },
  // Asia-Pacific
  {
    id: "OMAE-TMA",
    name: "Dubai TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7620,
    centerLat: 25.2532,
    centerLon: 55.3657,
    radius: 55_000,
    country: "AE",
  },
  {
    id: "RJTL-TMA",
    name: "Tokyo TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: 300,
    upperAlt: 7000,
    centerLat: 35.5523,
    centerLon: 139.7798,
    radius: 55_000,
    country: "JP",
  },
  {
    id: "WSJC-TMA",
    name: "Singapore TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7620,
    centerLat: 1.3644,
    centerLon: 103.9915,
    radius: 55_000,
    country: "SG",
  },
  {
    id: "VHHK-TMA",
    name: "Hong Kong TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7620,
    centerLat: 22.3080,
    centerLon: 113.9185,
    radius: 55_000,
    country: "HK",
  },
  {
    id: "YMMM-TMA",
    name: "Sydney TMA",
    classification: "C",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7620,
    centerLat: -33.9461,
    centerLon: 151.1772,
    radius: 55_000,
    country: "AU",
  },
  {
    id: "VIDP-TMA",
    name: "Delhi TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7620,
    centerLat: 28.5562,
    centerLon: 77.1000,
    radius: 55_000,
    country: "IN",
  },
  {
    id: "RKSI-TMA",
    name: "Seoul/Incheon TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7620,
    centerLat: 37.4602,
    centerLon: 126.4407,
    radius: 55_000,
    country: "KR",
  },
  {
    id: "ZBAA-TMA",
    name: "Beijing TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7620,
    centerLat: 40.0799,
    centerLon: 116.6031,
    radius: 55_000,
    country: "CN",
  },
  {
    id: "ZSPD-TMA",
    name: "Shanghai TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7620,
    centerLat: 31.1443,
    centerLon: 121.8083,
    radius: 55_000,
    country: "CN",
  },
  // Middle East / Africa
  {
    id: "OEJN-TMA",
    name: "Jeddah TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7620,
    centerLat: 21.6796,
    centerLon: 39.1565,
    radius: 55_000,
    country: "SA",
  },
  {
    id: "OTBD-TMA",
    name: "Doha TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7620,
    centerLat: 25.2731,
    centerLon: 51.6081,
    radius: 55_000,
    country: "QA",
  },
  {
    id: "FAOR-TMA",
    name: "Johannesburg TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7620,
    centerLat: -26.1392,
    centerLon: 28.2460,
    radius: 55_000,
    country: "ZA",
  },
  // South America
  {
    id: "SBGR-TMA",
    name: "Sao Paulo TMA",
    classification: "A",
    type: "TMA",
    lowerAlt: -1,
    upperAlt: 7620,
    centerLat: -23.4356,
    centerLon: -46.4731,
    radius: 55_000,
    country: "BR",
  },

  // ── CTRs (Control Zones) — ~10nm / 18 km radius around airports ────────
  {
    id: "KJFK-CTR",
    name: "JFK CTR",
    classification: "B",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 2300,
    centerLat: 40.6413,
    centerLon: -73.7781,
    radius: 18_000,
    country: "US",
  },
  {
    id: "KLAX-CTR",
    name: "LAX CTR",
    classification: "B",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 2300,
    centerLat: 33.9425,
    centerLon: -118.4081,
    radius: 18_000,
    country: "US",
  },
  {
    id: "KORD-CTR",
    name: "ORD CTR",
    classification: "B",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 2300,
    centerLat: 41.9742,
    centerLon: -87.9073,
    radius: 18_000,
    country: "US",
  },
  {
    id: "KATL-CTR",
    name: "ATL CTR",
    classification: "B",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 2300,
    centerLat: 33.6407,
    centerLon: -84.4277,
    radius: 18_000,
    country: "US",
  },
  {
    id: "KDFW-CTR",
    name: "DFW CTR",
    classification: "B",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 2300,
    centerLat: 32.8998,
    centerLon: -97.0403,
    radius: 18_000,
    country: "US",
  },
  {
    id: "KDEN-CTR",
    name: "DEN CTR",
    classification: "B",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 2300,
    centerLat: 39.8561,
    centerLon: -104.6737,
    radius: 18_000,
    country: "US",
  },
  {
    id: "KSFO-CTR",
    name: "SFO CTR",
    classification: "B",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 2300,
    centerLat: 37.6213,
    centerLon: -122.3790,
    radius: 18_000,
    country: "US",
  },
  {
    id: "EGLL-CTR",
    name: "Heathrow CTR",
    classification: "A",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 1070,
    centerLat: 51.4700,
    centerLon: -0.4543,
    radius: 18_000,
    country: "GB",
  },
  {
    id: "LFPG-CTR",
    name: "Charles de Gaulle CTR",
    classification: "D",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 600,
    centerLat: 49.0097,
    centerLon: 2.5479,
    radius: 18_000,
    country: "FR",
  },
  {
    id: "EDDF-CTR",
    name: "Frankfurt CTR",
    classification: "D",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 760,
    centerLat: 50.0333,
    centerLon: 8.5706,
    radius: 18_000,
    country: "DE",
  },
  {
    id: "EHAM-CTR",
    name: "Schiphol CTR",
    classification: "C",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 920,
    centerLat: 52.3086,
    centerLon: 4.7639,
    radius: 18_000,
    country: "NL",
  },
  {
    id: "OMDB-CTR",
    name: "Dubai CTR",
    classification: "D",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 760,
    centerLat: 25.2532,
    centerLon: 55.3657,
    radius: 18_000,
    country: "AE",
  },
  {
    id: "RJTT-CTR",
    name: "Haneda CTR",
    classification: "D",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 760,
    centerLat: 35.5523,
    centerLon: 139.7798,
    radius: 18_000,
    country: "JP",
  },
  {
    id: "WSSS-CTR",
    name: "Changi CTR",
    classification: "D",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 760,
    centerLat: 1.3644,
    centerLon: 103.9915,
    radius: 18_000,
    country: "SG",
  },
  {
    id: "VHHH-CTR",
    name: "Hong Kong International CTR",
    classification: "D",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 760,
    centerLat: 22.3080,
    centerLon: 113.9185,
    radius: 18_000,
    country: "HK",
  },
  {
    id: "YSSY-CTR",
    name: "Sydney CTR",
    classification: "C",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 760,
    centerLat: -33.9461,
    centerLon: 151.1772,
    radius: 18_000,
    country: "AU",
  },
  {
    id: "CYYZ-CTR",
    name: "Toronto Pearson CTR",
    classification: "C",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 920,
    centerLat: 43.6777,
    centerLon: -79.6248,
    radius: 18_000,
    country: "CA",
  },
  {
    id: "VIDP-CTR",
    name: "Delhi CTR",
    classification: "D",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 760,
    centerLat: 28.5562,
    centerLon: 77.1000,
    radius: 18_000,
    country: "IN",
  },
  {
    id: "RKSI-CTR",
    name: "Incheon CTR",
    classification: "D",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 760,
    centerLat: 37.4602,
    centerLon: 126.4407,
    radius: 18_000,
    country: "KR",
  },
  {
    id: "ZBAA-CTR",
    name: "Beijing Capital CTR",
    classification: "D",
    type: "CTR",
    lowerAlt: -1,
    upperAlt: 760,
    centerLat: 40.0799,
    centerLon: 116.6031,
    radius: 18_000,
    country: "CN",
  },

  // ── Restricted / prohibited / danger areas ─────────────────────────────
  {
    id: "KZDC-ADIZ",
    name: "Washington DC ADIZ",
    classification: "A",
    type: "restricted",
    lowerAlt: -1,
    upperAlt: 5490,
    centerLat: 38.8951,
    centerLon: -77.0364,
    radius: 100_000,
    country: "US",
  },
  {
    id: "P-56",
    name: "Washington DC P-56 (White House / Capitol)",
    classification: "A",
    type: "prohibited",
    lowerAlt: -1,
    upperAlt: -1,
    centerLat: 38.8977,
    centerLon: -77.0365,
    radius: 1_300,
    country: "US",
  },
  {
    id: "ZKKP-RESTRICT",
    name: "North Korea Restricted Airspace",
    classification: "A",
    type: "restricted",
    lowerAlt: -1,
    upperAlt: -1,
    centerLat: 39.0392,
    centerLon: 125.7625,
    radius: 250_000,
    country: "KP",
  },
  {
    id: "ORBB-RESTRICT",
    name: "Baghdad Restricted Zone",
    classification: "A",
    type: "restricted",
    lowerAlt: -1,
    upperAlt: 7620,
    centerLat: 33.2625,
    centerLon: 44.2346,
    radius: 60_000,
    country: "IQ",
  },
  {
    id: "LLBG-RESTRICT",
    name: "Tel Aviv Restricted Area",
    classification: "A",
    type: "restricted",
    lowerAlt: -1,
    upperAlt: 7620,
    centerLat: 32.0114,
    centerLon: 34.8867,
    radius: 50_000,
    country: "IL",
  },
];

// ── Lookup functions ───────────────────────────────────────────────────────

/**
 * Find all airspace zones that contain a given position.
 */
export function getAirspaceAtPosition(position: Position): AirspaceZone[] {
  const results: AirspaceZone[] = [];
  for (const zone of AIRSPACE_ZONES) {
    const effectiveLower = zone.lowerAlt === -1 ? -Infinity : zone.lowerAlt;
    const effectiveUpper = zone.upperAlt === -1 ? Infinity : zone.upperAlt;
    if (
      position.altitude >= effectiveLower &&
      position.altitude <= effectiveUpper
    ) {
      const dist = haversineDistance(
        position.latitude,
        position.longitude,
        zone.centerLat,
        zone.centerLon,
      );
      if (dist <= zone.radius) {
        results.push(zone);
      }
    }
  }
  return results;
}

/**
 * Get the airspace classification at a position.
 * Returns the most restrictive class if multiple zones overlap.
 * Most restrictive = lowest letter (A < B < C < ...).
 */
export function getAirspaceClass(position: Position): AirspaceClass {
  const zones = getAirspaceAtPosition(position);
  if (zones.length === 0) return "G"; // Uncontrolled
  const classes = zones.map((z) => z.classification);
  return classes.sort()[0];
}

/**
 * Check if a position is in restricted or prohibited airspace.
 */
export function isRestricted(position: Position): boolean {
  const zones = getAirspaceAtPosition(position);
  return zones.some((z) => z.type === "restricted" || z.type === "prohibited");
}

/**
 * Return all airspace zones in the database.
 */
export function getAllAirspaceZones(): AirspaceZone[] {
  return [...AIRSPACE_ZONES];
}
