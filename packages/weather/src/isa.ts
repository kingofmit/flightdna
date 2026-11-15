import type { AtmosphericConditions } from "./types";

/**
 * Physical constants for the International Standard Atmosphere.
 *
 * Reference: ICAO Doc 7488/3, Manual of the ICAO Standard Atmosphere
 */
const ISA_CONSTANTS = {
  /** Sea level temperature in Kelvin */
  T0: 288.15,
  /** Sea level pressure in Pascals */
  P0: 101_325,
  /** Sea level density in kg/m^3 */
  RHO0: 1.225,
  /** Temperature lapse rate in troposphere (K/m) */
  LAPSE_RATE: -0.0065,
  /** Tropopause altitude in meters */
  TROPOPAUSE: 11_000,
  /** Temperature at tropopause in Kelvin */
  T_TROPOPAUSE: 216.65,
  /** Specific gas constant for dry air (J/(kg*K)) */
  R: 287.058,
  /** Gravitational acceleration (m/s^2) */
  G: 9.80665,
  /** Ratio of specific heats for air */
  GAMMA: 1.4,
  /** Sutherland's constant for dynamic viscosity (K) */
  SUTHERLAND_C: 120,
  /** Sutherland's reference temperature (K) */
  SUTHERLAND_T_REF: 291.15,
  /** Sutherland's reference viscosity (Pa*s) */
  SUTHERLAND_MU_REF: 1.827e-5,
} as const;

/**
 * International Standard Atmosphere (ISA) calculator.
 *
 * Computes temperature, pressure, density, speed of sound, and
 * dynamic viscosity at any altitude from sea level to 86 km.
 */
export class ISACalculator {
  /**
   * Calculate ISA atmospheric conditions at a given altitude.
   *
   * @param altitude - Altitude in meters above mean sea level
   * @returns Atmospheric conditions at the specified altitude
   */
  calculate(altitude: number): AtmosphericConditions {
    const { temperature, pressure } = this.temperatureAndPressure(altitude);
    const density = pressure / (ISA_CONSTANTS.R * temperature);
    const speedOfSound = Math.sqrt(
      ISA_CONSTANTS.GAMMA * ISA_CONSTANTS.R * temperature,
    );
    const dynamicViscosity = this.sutherlandViscosity(temperature);

    return {
      temperature,
      pressure,
      density,
      speedOfSound,
      dynamicViscosity,
      altitude,
    };
  }

  /**
   * Calculate temperature deviation from ISA at a given altitude.
   * Positive = warmer than standard, negative = colder.
   */
  isaDeviation(altitude: number, actualTemperature: number): number {
    const { temperature } = this.temperatureAndPressure(altitude);
    return actualTemperature - temperature;
  }

  /**
   * Calculate pressure altitude from barometric pressure.
   * Uses the hypsometric equation.
   */
  pressureAltitude(pressureHPa: number): number {
    const pressurePa = pressureHPa * 100;
    // In the troposphere
    const exponent =
      (ISA_CONSTANTS.R * ISA_CONSTANTS.LAPSE_RATE) / ISA_CONSTANTS.G;
    return (
      (ISA_CONSTANTS.T0 / ISA_CONSTANTS.LAPSE_RATE) *
      (1 - (pressurePa / ISA_CONSTANTS.P0) ** exponent)
    );
  }

  /**
   * Calculate density altitude (altitude in ISA with the same density).
   */
  densityAltitude(
    pressureAltitude: number,
    outsideAirTemperature: number,
  ): number {
    const { temperature: isaTemp } =
      this.temperatureAndPressure(pressureAltitude);
    // Convert OAT from Celsius to Kelvin
    const oatK = outsideAirTemperature + 273.15;
    return pressureAltitude + (ISA_CONSTANTS.T0 / ISA_CONSTANTS.LAPSE_RATE) * (1 - isaTemp / oatK);
  }

  /**
   * Compute temperature and pressure at altitude using the ISA model.
   */
  private temperatureAndPressure(altitude: number): {
    temperature: number;
    pressure: number;
  } {
    if (altitude <= ISA_CONSTANTS.TROPOPAUSE) {
      // Troposphere: linear temperature decrease
      const temperature =
        ISA_CONSTANTS.T0 + ISA_CONSTANTS.LAPSE_RATE * altitude;
      const pressure =
        ISA_CONSTANTS.P0 *
        (temperature / ISA_CONSTANTS.T0) **
          (-ISA_CONSTANTS.G /
            (ISA_CONSTANTS.LAPSE_RATE * ISA_CONSTANTS.R));
      return { temperature, pressure };
    }

    // Stratosphere (11,000 - 20,000m): constant temperature
    const temperature = ISA_CONSTANTS.T_TROPOPAUSE;

    // Pressure at the tropopause
    const pTropopause =
      ISA_CONSTANTS.P0 *
      (ISA_CONSTANTS.T_TROPOPAUSE / ISA_CONSTANTS.T0) **
        (-ISA_CONSTANTS.G /
          (ISA_CONSTANTS.LAPSE_RATE * ISA_CONSTANTS.R));

    // Exponential pressure decrease in isothermal layer
    const pressure =
      pTropopause *
      Math.exp(
        (-ISA_CONSTANTS.G * (altitude - ISA_CONSTANTS.TROPOPAUSE)) /
          (ISA_CONSTANTS.R * temperature),
      );

    return { temperature, pressure };
  }

  /**
   * Calculate dynamic viscosity using Sutherland's formula.
   */
  private sutherlandViscosity(temperature: number): number {
    const { SUTHERLAND_C, SUTHERLAND_T_REF, SUTHERLAND_MU_REF } =
      ISA_CONSTANTS;
    return (
      SUTHERLAND_MU_REF *
      (temperature / SUTHERLAND_T_REF) ** 1.5 *
      ((SUTHERLAND_T_REF + SUTHERLAND_C) / (temperature + SUTHERLAND_C))
    );
  }
}
