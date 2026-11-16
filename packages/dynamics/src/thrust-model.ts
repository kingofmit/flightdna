/**
 * Parametric engine thrust model.
 *
 * Models thrust as a function of altitude (density ratio) and Mach number.
 * Supports turbofan (high bypass), turboprop, and simplified piston models.
 */
export type EngineType = "turbofan" | "turboprop" | "piston";

export interface ThrustModelConfig {
  /** Maximum sea-level static thrust per engine in Newtons */
  maxThrustSL: number;
  /** Number of engines */
  engineCount: number;
  /** Engine type */
  engineType: EngineType;
  /** Bypass ratio (turbofan only, affects altitude lapse) */
  bypassRatio?: number;
}

export class ThrustModel {
  private readonly config: ThrustModelConfig;

  constructor(config: ThrustModelConfig) {
    this.config = config;
  }

  /**
   * Compute available thrust at given conditions.
   *
   * @param altitude - Altitude in meters
   * @param mach - Mach number
   * @param density - Air density in kg/m³
   * @param seaLevelDensity - Sea-level density (default: 1.225)
   * @returns Available thrust in Newtons (total, all engines)
   */
  availableThrust(
    altitude: number,
    mach: number,
    density: number,
    seaLevelDensity: number = 1.225,
  ): number {
    const sigma = density / seaLevelDensity; // density ratio
    const totalSLThrust = this.config.maxThrustSL * this.config.engineCount;

    switch (this.config.engineType) {
      case "turbofan":
        return this.turbofanThrust(totalSLThrust, sigma, mach);
      case "turboprop":
        return this.turbopropThrust(totalSLThrust, sigma, mach);
      case "piston":
        return this.pistonThrust(totalSLThrust, sigma);
      default:
        return totalSLThrust * sigma;
    }
  }

  /**
   * Turbofan thrust model.
   *
   * T = T_SL * sigma^n * (1 - k*M + k2*M²)
   * where n depends on bypass ratio:
   *   High bypass (BPR > 4): n ≈ 0.7
   *   Low bypass (BPR < 4): n ≈ 0.9
   *
   * Ram effect at high Mach partially recovers thrust.
   */
  private turbofanThrust(
    slThrust: number,
    sigma: number,
    mach: number,
  ): number {
    const bpr = this.config.bypassRatio ?? 5;
    const n = bpr > 4 ? 0.7 : 0.9;

    // Altitude lapse
    const altFactor = sigma ** n;

    // Mach effect: thrust drops with speed (inlet losses) but
    // ram recovery provides partial compensation at higher Mach.
    // Empirical fit for high-bypass turbofan:
    const machFactor = 1 - 0.4 * mach + 0.15 * mach ** 2;

    return slThrust * altFactor * Math.max(0.3, machFactor);
  }

  /**
   * Turboprop thrust model.
   *
   * Power is roughly constant with altitude (sigma^0.75),
   * and thrust = Power / V, so thrust decreases with speed.
   */
  private turbopropThrust(
    slThrust: number,
    sigma: number,
    mach: number,
  ): number {
    const altFactor = sigma ** 0.75;
    // Power-based: T = P/V, normalized to give SL static thrust at M=0.1
    const refMach = 0.1;
    const machFactor = mach > 0.05 ? refMach / mach : 1;
    return slThrust * altFactor * Math.min(2, machFactor);
  }

  /**
   * Piston engine thrust.
   * Power proportional to density ratio.
   */
  private pistonThrust(slThrust: number, sigma: number): number {
    return slThrust * sigma;
  }

  /**
   * Estimate specific fuel consumption at given conditions.
   *
   * @param mach - Mach number
   * @param altitude - Altitude in meters
   * @returns SFC in kg/(N·s)
   */
  estimateSFC(mach: number, _altitude: number): number {
    switch (this.config.engineType) {
      case "turbofan": {
        // Typical cruise SFC for high-bypass turbofan: 15-20 mg/(N·s)
        // SFC increases with Mach: SFC = SFC_ref * (1 + 0.5*M)
        const baseSFC = 1.7e-5; // ~17 mg/(N·s) reference
        return baseSFC * (1 + 0.5 * mach);
      }
      case "turboprop": {
        // Turboprop SFC in terms of thrust: ~25-30 mg/(N·s)
        return 2.8e-5;
      }
      case "piston": {
        return 8e-5; // Much higher for piston
      }
      default:
        return 2e-5;
    }
  }
}
