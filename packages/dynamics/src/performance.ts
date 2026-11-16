import type {
  AircraftConfig,
  DragPolar,
  PerformanceMetrics,
} from "./types";

const G = 9.80665;

/**
 * Aircraft performance calculator.
 *
 * Computes range, endurance, fuel consumption, and other
 * performance metrics from the drag polar and flight conditions.
 */
export class PerformanceCalculator {
  private readonly config: AircraftConfig;

  constructor(config: AircraftConfig) {
    this.config = config;
  }

  /**
   * Calculate performance metrics at a given flight condition.
   */
  calculatePerformance(params: {
    altitude: number;
    mach: number;
    density: number;
    speedOfSound?: number;
    dragPolar: DragPolar;
    thrust?: number;
    sfc?: number;
    fuelMass?: number;
  }): PerformanceMetrics {
    const speedOfSound = params.speedOfSound ?? 295; // Approximate at altitude
    const tas = params.mach * speedOfSound;
    const q = 0.5 * params.density * tas ** 2;
    const weight = this.config.mass * G;

    // CL for level flight — guard against zero dynamic pressure
    const cl = q > 0 ? weight / (q * this.config.wingArea) : 0;

    // CD from drag polar
    const cd =
      params.dragPolar.cd0 + params.dragPolar.k * cl ** 2;

    const liftToDrag = cl / cd;
    const drag = q * this.config.wingArea * cd;

    // Rate of climb (if thrust is provided)
    const thrust = params.thrust ?? drag; // Assume level flight if no thrust
    const rateOfClimb = ((thrust - drag) * tas) / weight;
    const specificExcessPower = rateOfClimb;

    const loadFactor = (q * this.config.wingArea * cl) / weight;

    // Fuel consumption estimates
    let specificFuelConsumption: number | undefined;
    let fuelFlow: number | undefined;
    let specificRange: number | undefined;
    let range: number | undefined;
    let endurance: number | undefined;

    if (params.sfc) {
      specificFuelConsumption = params.sfc;
      fuelFlow = params.sfc * thrust;
      specificRange = fuelFlow > 0 ? tas / fuelFlow : undefined;

      if (params.fuelMass && params.fuelMass > 0 && fuelFlow > 0) {
        // Breguet range equation (simplified, constant altitude/speed)
        const massRatio = this.config.mass / (this.config.mass - params.fuelMass);
        if (massRatio > 0 && Number.isFinite(massRatio)) {
          range =
            (tas / (specificFuelConsumption * G)) *
            liftToDrag *
            Math.log(massRatio);
        }
        endurance = params.fuelMass / fuelFlow;
      }
    }

    return {
      mach: params.mach,
      trueAirspeed: tas,
      liftToDrag,
      rateOfClimb,
      specificFuelConsumption,
      fuelFlow,
      specificRange,
      range,
      endurance,
      specificExcessPower,
      loadFactor,
    };
  }

  /**
   * Find the Mach number for maximum range (Carson's speed).
   * At max range speed, CL = sqrt(CD0 / (3*k)).
   */
  maxRangeMach(
    density: number,
    dragPolar: DragPolar,
    speedOfSound: number = 295,
  ): number {
    if (density <= 0 || dragPolar.k <= 0 || speedOfSound <= 0) return 0;
    const clMaxRange = Math.sqrt(
      dragPolar.cd0 / (3 * dragPolar.k),
    );
    if (clMaxRange <= 0) return 0;
    const weight = this.config.mass * G;
    const q = weight / (this.config.wingArea * clMaxRange);
    const tas = Math.sqrt((2 * q) / density);
    return tas / speedOfSound;
  }

  /**
   * Find the Mach number for maximum endurance.
   * At max endurance, CL = sqrt(3 * CD0 / k).
   */
  maxEnduranceMach(
    density: number,
    dragPolar: DragPolar,
    speedOfSound: number = 295,
  ): number {
    if (density <= 0 || dragPolar.k <= 0 || speedOfSound <= 0) return 0;
    const clMaxEndurance = Math.sqrt(
      (3 * dragPolar.cd0) / dragPolar.k,
    );
    if (clMaxEndurance <= 0) return 0;
    const weight = this.config.mass * G;
    const q = weight / (this.config.wingArea * clMaxEndurance);
    const tas = Math.sqrt((2 * q) / density);
    return tas / speedOfSound;
  }

  /**
   * Calculate the service ceiling (altitude where max ROC = 0.5 m/s).
   * This is a simplified estimation.
   */
  estimateServiceCeiling(
    maxThrust: number,
    dragPolar: DragPolar,
    seaLevelDensity: number = 1.225,
  ): number {
    // Iterative search — simplified
    const weight = this.config.mass * G;
    let altitude = 0;
    const step = 500; // meters

    while (altitude < 20_000) {
      // Approximate density using exponential model
      const density = seaLevelDensity * Math.exp(-altitude / 8500);
      const q = 0.5 * density * (250 ** 2); // Approximate speed
      const cl = weight / (q * this.config.wingArea);
      const cd = dragPolar.cd0 + dragPolar.k * cl ** 2;
      const drag = q * this.config.wingArea * cd;

      // Assume thrust decreases linearly with density ratio
      const thrustAtAlt =
        maxThrust * (density / seaLevelDensity);
      const roc = ((thrustAtAlt - drag) * 250) / weight;

      if (roc < 0.5) return altitude;
      altitude += step;
    }

    return altitude;
  }
}
