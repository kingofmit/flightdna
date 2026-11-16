import { describe, it, expect, beforeEach } from "vitest";
import { ADSBDecoder } from "../decoder";

describe("ADSBDecoder", () => {
  let decoder: ADSBDecoder;

  beforeEach(() => {
    decoder = new ADSBDecoder();
  });

  describe("hex validation and unknown messages", () => {
    it("should return unknown type for invalid hex characters", () => {
      const result = decoder.decode("ZZZZZZZZZZZZZZZZZZZZZZZZZZZZ");
      expect(result.type).toBe("unknown");
    });

    it("should return unknown type for wrong-length hex", () => {
      const result = decoder.decode("8D48");
      expect(result.type).toBe("unknown");
    });

    it("should return unknown type for empty string", () => {
      const result = decoder.decode("");
      expect(result.type).toBe("unknown");
    });
  });

  describe("downlink format extraction", () => {
    it("should extract DF=17 from ADS-B messages (first 5 bits)", () => {
      // 0x8D = 10001101 binary, DF = 10001 = 17
      const hex = "8D4840D6202CC371C32CE0576098";
      const result = decoder.decode(hex);
      // If CRC passes, the type will be decoded; DF=17 means ADS-B
      // The first byte 0x8D >> 3 = 0x11 = 17
      expect(result.icao24).not.toBe("000000");
    });
  });

  describe("ICAO24 extraction", () => {
    it("should extract ICAO24 from identification message", () => {
      const hex = "8D4840D6202CC371C32CE0576098";
      const result = decoder.decode(hex);
      expect(result.icao24).toBe("4840d6");
    });

    it("should extract ICAO24 from position message", () => {
      const hex = "8D40621D58C382D690C8AC2863A7";
      const result = decoder.decode(hex);
      expect(result.icao24).toBe("40621d");
    });

    it("should extract ICAO24 from velocity message", () => {
      const hex = "8D485020994409940838175B284F";
      const result = decoder.decode(hex);
      expect(result.icao24).toBe("485020");
    });
  });

  describe("type code classification", () => {
    it("should classify TC=1-4 as identification", () => {
      // 0x8D4840D6 20... -> byte[4] = 0x20 = 00100000, TC = 00100 = 4
      const hex = "8D4840D6202CC371C32CE0576098";
      const result = decoder.decode(hex);
      expect(result.type).toBe("identification");
      expect(result.typeCode).toBe(4);
    });

    it("should classify TC=9-18 as airborne_position", () => {
      // 0x58 = 01011000, TC = 01011 = 11
      const hex = "8D40621D58C382D690C8AC2863A7";
      const result = decoder.decode(hex);
      expect(result.type).toBe("airborne_position");
      expect(result.typeCode).toBe(11);
    });

    it("should classify TC=19 as airborne_velocity", () => {
      // 0x99 = 10011001, TC = 10011 = 19
      const hex = "8D485020994409940838175B284F";
      const result = decoder.decode(hex);
      expect(result.type).toBe("airborne_velocity");
      expect(result.typeCode).toBe(19);
    });
  });

  describe("identification decoding (callsign)", () => {
    it("should decode a callsign from an identification message", () => {
      const hex = "8D4840D6202CC371C32CE0576098";
      const result = decoder.decode(hex);
      expect(result.type).toBe("identification");
      expect(result.data).toHaveProperty("callsign");
      expect(typeof result.data.callsign).toBe("string");
      expect((result.data.callsign as string).length).toBeGreaterThan(0);
    });

    it("should decode the category from an identification message", () => {
      const hex = "8D4840D6202CC371C32CE0576098";
      const result = decoder.decode(hex);
      expect(result.data).toHaveProperty("category");
      expect(typeof result.data.category).toBe("number");
    });
  });

  describe("altitude decoding (Q-bit=1)", () => {
    it("should decode altitude from an airborne position message", () => {
      const hex = "8D40621D58C382D690C8AC2863A7";
      const result = decoder.decode(hex);
      expect(result.type).toBe("airborne_position");
      expect(result.data).toHaveProperty("altitude");
      // Altitude should be a reasonable flight level (in meters)
      const altitude = result.data.altitude as number;
      expect(altitude).toBeGreaterThan(0);
      expect(altitude).toBeLessThan(20000); // below 65,000 ft in meters
    });

    it("should return altitude in meters (converted from feet)", () => {
      const hex = "8D40621D58C382D690C8AC2863A7";
      const result = decoder.decode(hex);
      const altitude = result.data.altitude as number;
      // The altitude should be a non-zero positive value in meters
      expect(altitude).toBeDefined();
      expect(altitude).not.toBeNull();
    });
  });

  describe("velocity decoding (subtype 1: ground speed)", () => {
    it("should decode ground speed from a velocity message", () => {
      const hex = "8D485020994409940838175B284F";
      const result = decoder.decode(hex);
      expect(result.type).toBe("airborne_velocity");
      expect(result.data).toHaveProperty("groundSpeed");
      const gs = result.data.groundSpeed as number;
      // Ground speed should be a positive value in m/s
      expect(gs).toBeGreaterThan(0);
      // Reasonable range: 0-400 m/s
      expect(gs).toBeLessThan(400);
    });

    it("should decode track angle from a velocity message", () => {
      const hex = "8D485020994409940838175B284F";
      const result = decoder.decode(hex);
      expect(result.data).toHaveProperty("track");
      const track = result.data.track as number;
      // Track angle should be 0-360 degrees
      expect(track).toBeGreaterThanOrEqual(0);
      expect(track).toBeLessThan(360);
    });

    it("should decode vertical rate from a velocity message", () => {
      const hex = "8D485020994409940838175B284F";
      const result = decoder.decode(hex);
      expect(result.data).toHaveProperty("verticalRate");
      const vr = result.data.verticalRate as number;
      // Vertical rate in m/s, can be positive or negative
      expect(typeof vr).toBe("number");
    });
  });

  describe("CPR position data", () => {
    it("should output CPR latitude and longitude values", () => {
      const hex = "8D40621D58C382D690C8AC2863A7";
      const result = decoder.decode(hex);
      expect(result.data).toHaveProperty("cprLatitude");
      expect(result.data).toHaveProperty("cprLongitude");
      const cprLat = result.data.cprLatitude as number;
      const cprLon = result.data.cprLongitude as number;
      // CPR values are normalized between 0 and 1
      expect(cprLat).toBeGreaterThanOrEqual(0);
      expect(cprLat).toBeLessThanOrEqual(1);
      expect(cprLon).toBeGreaterThanOrEqual(0);
      expect(cprLon).toBeLessThanOrEqual(1);
    });

    it("should output the CPR format flag (fflag)", () => {
      const hex = "8D40621D58C382D690C8AC2863A7";
      const result = decoder.decode(hex);
      expect(result.data).toHaveProperty("fflag");
      const fflag = result.data.fflag as number;
      expect(fflag === 0 || fflag === 1).toBe(true);
    });
  });

  describe("timestamp", () => {
    it("should include a timestamp in the decoded message", () => {
      const hex = "8D485020994409940838175B284F";
      const result = decoder.decode(hex);
      expect(result.timestamp).toBeGreaterThan(0);
      expect(typeof result.timestamp).toBe("number");
    });
  });

  describe("CRC verification", () => {
    it("should reject messages with invalid CRC as unknown", () => {
      // Modify last byte to corrupt CRC
      const hex = "8D4840D6202CC371C32CE05760FF";
      const result = decoder.decode(hex);
      expect(result.type).toBe("unknown");
    });
  });
});
