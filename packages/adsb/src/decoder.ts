import type {
  ADSBMessageType,
  DecodedADSBMessage,
  RawADSBMessage,
} from "./types";

/**
 * Compact Position Reporting (CPR) position pair for global/local decoding.
 */
interface CPRPosition {
  latCPR: number;
  lonCPR: number;
  fflag: 0 | 1; // 0 = even, 1 = odd
}

const AIRBORNE_CPR_TTL_MS = 10_000;

/**
 * NL lookup table: number of longitude zones for CPR global decoding.
 * NL(lat) is the number of longitude zones between 1 and 59.
 */
function NL(lat: number): number {
  const absLat = Math.abs(lat);
  if (absLat === 0) return 59;
  if (absLat >= 87) return 1;
  // NL transition latitudes (precomputed from the NL formula)
  const nlTable: [number, number][] = [
    [10.47, 59], [14.82, 58], [18.19, 57], [21.03, 56], [23.55, 55],
    [25.83, 54], [27.94, 53], [29.91, 52], [31.77, 51], [33.54, 50],
    [35.23, 49], [36.85, 48], [38.41, 47], [39.92, 46], [41.39, 45],
    [42.81, 44], [44.19, 43], [45.55, 42], [46.87, 41], [48.17, 40],
    [49.44, 39], [50.69, 38], [51.92, 37], [53.13, 36], [54.33, 35],
    [55.52, 34], [56.70, 33], [57.86, 32], [59.02, 31], [60.17, 30],
    [61.31, 29], [62.44, 28], [63.57, 27], [64.70, 26], [65.82, 25],
    [66.93, 24], [68.04, 23], [69.16, 22], [70.27, 21], [71.39, 20],
    [72.51, 19], [73.64, 18], [74.78, 17], [75.93, 16], [77.10, 15],
    [78.29, 14], [79.50, 13], [80.74, 12], [82.02, 11], [83.36, 10],
    [84.77, 9], [86.18, 8],
  ];
  for (const [threshold, nl] of nlTable) {
    if (absLat < threshold) return nl;
  }
  return 1;
}

const CRC_GENERATOR = 0xFFF409;

/**
 * ADS-B and Mode S message decoder.
 *
 * Decodes raw hex messages into structured data including
 * identification, position, velocity, and operational status.
 */
export class ADSBDecoder {
  private cprCache = new Map<
    string,
    { even?: CPRPosition & { timestamp: number }; odd?: CPRPosition & { timestamp: number } }
  >();

  /**
   * Decode a raw hex ADS-B message string.
   */
  decode(hex: string): DecodedADSBMessage {
    const clean = hex.replace(/\s/g, "");

    if (!/^[0-9a-fA-F]+$/.test(clean)) {
      return { type: "unknown", icao24: "000000", typeCode: 0, timestamp: Date.now(), data: {} };
    }

    if (clean.length !== 14 && clean.length !== 28) {
      return { type: "unknown", icao24: "000000", typeCode: 0, timestamp: Date.now(), data: {} };
    }

    const bytes = this.hexToBytes(clean);

    if (clean.length === 28 && !this.verifyCRC(bytes)) {
      return { type: "unknown", icao24: "000000", typeCode: 0, timestamp: Date.now(), data: {} };
    }

    const raw = this.parseRaw(hex, bytes);
    return this.decodeMessage(raw);
  }

  /**
   * Decode a raw message structure.
   */
  decodeMessage(raw: RawADSBMessage): DecodedADSBMessage {
    const icao24 = this.extractICAO24(raw.payload, raw.downlinkFormat);
    const typeCode = this.extractTypeCode(raw.payload, raw.downlinkFormat);
    const type = this.classifyMessage(typeCode, raw.downlinkFormat);

    const data: Record<string, unknown> = {};

    switch (type) {
      case "identification":
        Object.assign(data, this.decodeIdentification(raw.payload));
        break;
      case "airborne_position":
        Object.assign(data, this.decodeAirbornePosition(raw.payload, icao24));
        break;
      case "airborne_velocity":
        Object.assign(data, this.decodeAirborneVelocity(raw.payload));
        break;
      case "surface_position":
        Object.assign(data, this.decodeSurfacePosition(raw.payload));
        break;
      default:
        break;
    }

    return {
      type,
      icao24,
      typeCode,
      timestamp: raw.timestamp,
      data,
    };
  }

  /**
   * Resolve a global CPR position for a given aircraft from the cache.
   */
  resolvePosition(icao24: string): { latitude: number; longitude: number } | null {
    const cache = this.cprCache.get(icao24);
    if (!cache?.even || !cache?.odd) return null;

    const timeDiff = Math.abs(cache.even.timestamp - cache.odd.timestamp);
    if (timeDiff > AIRBORNE_CPR_TTL_MS) return null;

    const lat0 = cache.even.latCPR;
    const lat1 = cache.odd.latCPR;
    const lon0 = cache.even.lonCPR;
    const lon1 = cache.odd.lonCPR;

    const dLat0 = 360 / 60;
    const dLat1 = 360 / 59;

    const j = Math.floor(59 * lat0 - 60 * lat1 + 0.5);

    let latEven = dLat0 * (mod(j, 60) + lat0);
    let latOdd = dLat1 * (mod(j, 59) + lat1);

    if (latEven >= 270) latEven -= 360;
    if (latOdd >= 270) latOdd -= 360;

    if (NL(latEven) !== NL(latOdd)) return null;

    const fflag = cache.even.timestamp >= cache.odd.timestamp ? 0 : 1;
    const lat = fflag === 0 ? latEven : latOdd;
    const nlVal = NL(lat);
    const ni = Math.max(nlVal - fflag, 1);
    const dLon = 360 / ni;
    const m = Math.floor(lon0 * (nlVal - 1) - lon1 * nlVal + 0.5);
    const lonCPR = fflag === 0 ? lon0 : lon1;
    let lon = dLon * (mod(m, ni) + lonCPR);

    if (lon >= 180) lon -= 360;

    return { latitude: lat, longitude: lon };
  }

  private verifyCRC(bytes: Uint8Array): boolean {
    const msgBytes = bytes.length; // 14 bytes for 112-bit messages
    const dataLen = msgBytes - 3;
    let crc = 0;

    for (let i = 0; i < dataLen; i++) {
      crc ^= bytes[i] << 16;
      for (let bit = 0; bit < 8; bit++) {
        if (crc & 0x800000) {
          crc = (crc << 1) ^ CRC_GENERATOR;
        } else {
          crc = crc << 1;
        }
        crc &= 0xFFFFFF;
      }
    }

    const msgCRC = (bytes[dataLen] << 16) | (bytes[dataLen + 1] << 8) | bytes[dataLen + 2];
    return crc === msgCRC;
  }

  /**
   * Convert hex string to byte array.
   */
  private hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/\s/g, "");
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  /**
   * Parse raw hex into a RawADSBMessage.
   */
  private parseRaw(hex: string, bytes: Uint8Array): RawADSBMessage {
    const downlinkFormat = (bytes[0] >> 3) & 0x1f;
    return {
      hex: hex.toUpperCase(),
      timestamp: Date.now(),
      downlinkFormat,
      payload: bytes,
    };
  }

  /**
   * Extract the ICAO24 address from the message.
   */
  private extractICAO24(payload: Uint8Array, df: number): string {
    // For DF17 (ADS-B), ICAO24 is in bytes 1-3
    if (df === 17 || df === 18) {
      return (
        payload[1].toString(16).padStart(2, "0") +
        payload[2].toString(16).padStart(2, "0") +
        payload[3].toString(16).padStart(2, "0")
      );
    }
    // For other DFs, address may be elsewhere or in parity
    return "000000";
  }

  /**
   * Extract the type code (TC) from the ME (Message Extended) field.
   */
  private extractTypeCode(payload: Uint8Array, df: number): number {
    if (df === 17 || df === 18) {
      return (payload[4] >> 3) & 0x1f;
    }
    return 0;
  }

  /**
   * Classify the ADS-B message type from the type code.
   */
  private classifyMessage(tc: number, df: number): ADSBMessageType {
    if (df !== 17 && df !== 18) return "unknown";

    if (tc >= 1 && tc <= 4) return "identification";
    if (tc >= 5 && tc <= 8) return "surface_position";
    if (tc >= 9 && tc <= 18) return "airborne_position";
    if (tc === 19) return "airborne_velocity";
    if (tc >= 20 && tc <= 22) return "airborne_position"; // GNSS height
    if (tc === 28) return "surveillance_status";
    if (tc === 29) return "operational_status";
    if (tc === 31) return "operational_status";
    return "unknown";
  }

  /**
   * Decode aircraft identification message (TC 1-4).
   */
  private decodeIdentification(
    payload: Uint8Array,
  ): { callsign: string; category: number } {
    const charset =
      "#ABCDEFGHIJKLMNOPQRSTUVWXYZ##### ###############0123456789######";

    const tc = (payload[4] >> 3) & 0x1f;
    const category = payload[4] & 0x07;

    // Extract 8 characters, 6 bits each, from bits 40-87
    let callsign = "";
    const bits = this.bytesToBitString(payload).substring(40, 88);
    for (let i = 0; i < 8; i++) {
      const charCode = parseInt(bits.substring(i * 6, i * 6 + 6), 2);
      const ch = charset[charCode] ?? "#";
      if (ch !== "#" && ch !== " ") {
        callsign += ch;
      }
    }

    return {
      callsign: callsign.trim(),
      category: (tc - 1) * 8 + category,
    };
  }

  /**
   * Decode airborne position message (TC 9-18, 20-22).
   */
  private decodeAirbornePosition(
    payload: Uint8Array,
    icao24: string,
  ): {
    altitude: number | null;
    cprLatitude: number;
    cprLongitude: number;
    fflag: 0 | 1;
    latitude?: number;
    longitude?: number;
  } {
    const bits = this.bytesToBitString(payload);

    // Surveillance status (2 bits at position 37-38)
    // Altitude (12 bits at position 40-51)
    const altBits = bits.substring(40, 52);
    const altitude = this.decodeAltitude(altBits);

    // CPR format flag (bit 53)
    const fflag = (parseInt(bits[53], 2) as 0 | 1);

    // CPR encoded latitude (17 bits at 54-70)
    const latCPR = parseInt(bits.substring(54, 71), 2) / 131072;

    // CPR encoded longitude (17 bits at 71-87)
    const lonCPR = parseInt(bits.substring(71, 88), 2) / 131072;

    // Cache for CPR global decoding
    if (!this.cprCache.has(icao24)) {
      this.cprCache.set(icao24, {});
    }
    const cache = this.cprCache.get(icao24)!;
    const now = Date.now();
    const entry = { latCPR, lonCPR, fflag, timestamp: now };

    if (fflag === 0) {
      if (cache.odd && (now - cache.odd.timestamp) > AIRBORNE_CPR_TTL_MS) {
        cache.odd = undefined;
      }
      cache.even = entry;
    } else {
      if (cache.even && (now - cache.even.timestamp) > AIRBORNE_CPR_TTL_MS) {
        cache.even = undefined;
      }
      cache.odd = entry;
    }

    const result: {
      altitude: number | null;
      cprLatitude: number;
      cprLongitude: number;
      fflag: 0 | 1;
      latitude?: number;
      longitude?: number;
    } = {
      altitude,
      cprLatitude: latCPR,
      cprLongitude: lonCPR,
      fflag,
    };

    const resolved = this.resolvePosition(icao24);
    if (resolved) {
      result.latitude = resolved.latitude;
      result.longitude = resolved.longitude;
    }

    return result;
  }

  /**
   * Decode airborne velocity message (TC 19).
   */
  private decodeAirborneVelocity(
    payload: Uint8Array,
  ): {
    groundSpeed: number | null;
    track: number | null;
    verticalRate: number | null;
    heading: number | null;
  } {
    const bits = this.bytesToBitString(payload);
    const subtype = parseInt(bits.substring(37, 40), 2);

    let groundSpeed: number | null = null;
    let track: number | null = null;
    let heading: number | null = null;
    let verticalRate: number | null = null;

    if (subtype === 1 || subtype === 2) {
      // Ground speed (East-West and North-South components)
      const ewSign = parseInt(bits[46], 2) === 1 ? -1 : 1;
      const ewVelocity = parseInt(bits.substring(47, 57), 2) - 1;
      const nsSign = parseInt(bits[57], 2) === 1 ? -1 : 1;
      const nsVelocity = parseInt(bits.substring(58, 68), 2) - 1;

      const vEW = ewSign * ewVelocity * (subtype === 2 ? 4 : 1);
      const vNS = nsSign * nsVelocity * (subtype === 2 ? 4 : 1);

      // Ground speed in knots, convert to m/s
      groundSpeed = Math.sqrt(vEW ** 2 + vNS ** 2) * 0.514444;
      track = (Math.atan2(vEW, vNS) * 180) / Math.PI;
      if (track < 0) track += 360;
    } else if (subtype === 3 || subtype === 4) {
      // Airspeed and heading
      const headingAvailable = parseInt(bits[46], 2) === 1;
      if (headingAvailable) {
        heading = (parseInt(bits.substring(47, 57), 2) / 1024) * 360;
      }
    }

    // Vertical rate (bits 68-77)
    const vrSign = parseInt(bits[68], 2) === 1 ? -1 : 1;
    const vrValue = parseInt(bits.substring(69, 78), 2) - 1;
    if (vrValue >= 0) {
      // Vertical rate in ft/min, convert to m/s
      verticalRate = vrSign * vrValue * 64 * 0.00508;
    }

    return { groundSpeed, track, verticalRate, heading };
  }

  /**
   * Decode surface position message (TC 5-8).
   */
  private decodeSurfacePosition(
    payload: Uint8Array,
  ): { groundSpeed: number | null; trackAngle: number | null } {
    const bits = this.bytesToBitString(payload);

    // Movement (ground speed encoded, bits 37-43)
    const movement = parseInt(bits.substring(37, 44), 2);
    let groundSpeed: number | null = null;
    if (movement > 0 && movement < 124) {
      // Decode non-linear ground speed encoding
      if (movement <= 8) groundSpeed = (movement - 1) * 0.125;
      else if (movement <= 12) groundSpeed = 1 + (movement - 9) * 0.25;
      else if (movement <= 38) groundSpeed = 2 + (movement - 13) * 0.5;
      else if (movement <= 93) groundSpeed = 15 + (movement - 39);
      else if (movement <= 108) groundSpeed = 70 + (movement - 94) * 2;
      else groundSpeed = 100 + (movement - 109) * 5;
      // Convert knots to m/s
      groundSpeed *= 0.514444;
    }

    // Track/heading (bits 44-51)
    const trackStatusBit = parseInt(bits[44], 2);
    let trackAngle: number | null = null;
    if (trackStatusBit === 1) {
      trackAngle = (parseInt(bits.substring(45, 52), 2) / 128) * 360;
    }

    return { groundSpeed, trackAngle };
  }

  /**
   * Decode 12-bit altitude field.
   */
  private decodeAltitude(altBits: string): number | null {
    // Q-bit is bit 8 (index 7 in the 12-bit string)
    const qBit = parseInt(altBits[7], 2);

    if (qBit === 1) {
      // Remove Q-bit and decode as 11-bit integer
      const n =
        parseInt(altBits.substring(0, 7) + altBits.substring(8), 2);
      // Altitude in feet, convert to meters
      const altFeet = n * 25 - 1000;
      return altFeet * 0.3048;
    }

    // Gillham code (Mode C altitude encoding) — not decoded.
    // Q-bit=0 indicates legacy 100-foot resolution encoding used by older transponders.
    // This affects <5% of aircraft. When encountered, altitude is unavailable.
    return null;
  }

  /**
   * Remove stale entries from the CPR position cache.
   * Should be called periodically when processing message streams.
   */
  pruneCPRCache(maxAgeMs: number = 60_000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [icao24, cache] of this.cprCache) {
      const evenStale = !cache.even || cache.even.timestamp < cutoff;
      const oddStale = !cache.odd || cache.odd.timestamp < cutoff;
      if (evenStale && oddStale) {
        this.cprCache.delete(icao24);
      }
    }
  }

  /**
   * Get the current size of the CPR cache (number of tracked ICAO24 addresses).
   */
  get cprCacheSize(): number {
    return this.cprCache.size;
  }

  /**
   * Convert byte array to a bit string.
   */
  private bytesToBitString(bytes: Uint8Array): string {
    let result = "";
    for (const byte of bytes) {
      result += byte.toString(2).padStart(8, "0");
    }
    return result;
  }
}

function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}
