import { describe, it, expect, beforeEach } from "vitest";
import { ISACalculator } from "../isa";

describe("ISACalculator", () => {
  let isa: ISACalculator;

  beforeEach(() => {
    isa = new ISACalculator();
  });

  describe("ICAO Doc 7488 standard atmosphere table values", () => {
    // Reference: ICAO Doc 7488/3, Manual of the ICAO Standard Atmosphere
    const tableEntries = [
      { altitude: 0, temperature: 288.15, pressure: 101325, density: 1.225 },
      { altitude: 1000, temperature: 281.65, pressure: 89874.6, density: 1.1117 },
      { altitude: 5000, temperature: 255.65, pressure: 54019.9, density: 0.7361 },
      { altitude: 10000, temperature: 223.15, pressure: 26436.3, density: 0.4127 },
      { altitude: 11000, temperature: 216.65, pressure: 22632.1, density: 0.3639 },
      { altitude: 15000, temperature: 216.65, pressure: 12044.6, density: 0.1937 },
      { altitude: 20000, temperature: 216.65, pressure: 5474.9, density: 0.088 },
    ];

    for (const entry of tableEntries) {
      describe(`at ${entry.altitude}m`, () => {
        it(`temperature should be ~${entry.temperature} K (within 0.5%)`, () => {
          const result = isa.calculate(entry.altitude);
          const tolerance = entry.temperature * 0.005;
          expect(result.temperature).toBeCloseTo(entry.temperature, -Math.log10(tolerance));
          expect(Math.abs(result.temperature - entry.temperature) / entry.temperature).toBeLessThan(0.005);
        });

        it(`pressure should be ~${entry.pressure} Pa (within 1%)`, () => {
          const result = isa.calculate(entry.altitude);
          expect(Math.abs(result.pressure - entry.pressure) / entry.pressure).toBeLessThan(0.01);
        });

        it(`density should be ~${entry.density} kg/m^3 (within 1%)`, () => {
          const result = isa.calculate(entry.altitude);
          expect(Math.abs(result.density - entry.density) / entry.density).toBeLessThan(0.01);
        });
      });
    }
  });

  describe("speed of sound", () => {
    it("should be ~340.3 m/s at sea level", () => {
      const result = isa.calculate(0);
      expect(result.speedOfSound).toBeCloseTo(340.3, 0);
    });

    it("should be ~295.1 m/s at 11 km", () => {
      const result = isa.calculate(11000);
      expect(result.speedOfSound).toBeCloseTo(295.1, 0);
    });
  });

  describe("pressureAltitude", () => {
    it("should return ~0 for standard sea level pressure (1013.25 hPa)", () => {
      const alt = isa.pressureAltitude(1013.25);
      expect(Math.abs(alt)).toBeLessThan(1);
    });

    it("should return positive altitude for lower-than-standard pressure", () => {
      const alt = isa.pressureAltitude(900);
      expect(alt).toBeGreaterThan(0);
    });

    it("should return negative altitude for higher-than-standard pressure", () => {
      const alt = isa.pressureAltitude(1050);
      expect(alt).toBeLessThan(0);
    });
  });

  describe("densityAltitude", () => {
    it("should equal pressure altitude at ISA conditions", () => {
      // At ISA conditions, the temperature at a given altitude matches ISA exactly.
      // For sea level: pressure altitude = 0, ISA temp = 288.15 K = 15 C
      const pressAlt = 0;
      const isaTemp = 288.15 - 273.15; // 15 C
      const densAlt = isa.densityAltitude(pressAlt, isaTemp);
      expect(Math.abs(densAlt - pressAlt)).toBeLessThan(1);
    });

    it("should be higher than pressure altitude when warmer than ISA", () => {
      const pressAlt = 1000;
      const warmerThanISA = (281.65 - 273.15) + 10; // ISA+10°C at 1000m
      const densAlt = isa.densityAltitude(pressAlt, warmerThanISA);
      // Warmer air is less dense → density altitude should be HIGHER
      expect(densAlt).toBeGreaterThan(pressAlt);
    });

    it("should be lower than pressure altitude when cooler than ISA", () => {
      const pressAlt = 1000;
      const coolerThanISA = (281.65 - 273.15) - 10; // ISA-10°C at 1000m
      const densAlt = isa.densityAltitude(pressAlt, coolerThanISA);
      // Cooler air is denser → density altitude should be LOWER
      expect(densAlt).toBeLessThan(pressAlt);
    });
  });

  describe("ISA deviation", () => {
    it("should return 0 for ISA standard temperature", () => {
      const deviation = isa.isaDeviation(0, 288.15);
      expect(Math.abs(deviation)).toBeLessThan(0.01);
    });

    it("should return positive value for warmer-than-standard", () => {
      const deviation = isa.isaDeviation(0, 298.15);
      expect(deviation).toBeCloseTo(10, 1);
    });

    it("should return negative value for colder-than-standard", () => {
      const deviation = isa.isaDeviation(0, 278.15);
      expect(deviation).toBeCloseTo(-10, 1);
    });
  });

  describe("dynamic viscosity", () => {
    it("should return a positive value at sea level", () => {
      const result = isa.calculate(0);
      expect(result.dynamicViscosity).toBeGreaterThan(0);
    });

    it("should decrease with altitude (lower temperature)", () => {
      const seaLevel = isa.calculate(0);
      const high = isa.calculate(10000);
      expect(high.dynamicViscosity).toBeLessThan(seaLevel.dynamicViscosity);
    });
  });

  describe("altitude field passthrough", () => {
    it("should include the input altitude in the result", () => {
      const result = isa.calculate(5000);
      expect(result.altitude).toBe(5000);
    });
  });
});
