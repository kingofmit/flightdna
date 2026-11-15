import type { DragPolar, DragPolarObservation } from "./types";

/**
 * Estimates the drag polar (CD = CD0 + k*CL^2) from observed
 * lift and drag coefficient pairs using least-squares regression.
 */
export class DragPolarEstimator {
  private observations: DragPolarObservation[] = [];

  /**
   * Add an observation point.
   */
  addObservation(obs: DragPolarObservation): void {
    this.observations.push(obs);
  }

  /**
   * Add multiple observations at once.
   */
  addObservations(observations: DragPolarObservation[]): void {
    this.observations.push(...observations);
  }

  /**
   * Clear all observations.
   */
  clear(): void {
    this.observations = [];
  }

  /**
   * Number of observations collected.
   */
  get count(): number {
    return this.observations.length;
  }

  /**
   * Estimate the drag polar from collected observations.
   *
   * Uses ordinary least squares: CD = CD0 + k * CL^2
   * where x = CL^2 and y = CD.
   *
   * @param aspectRatio - Wing aspect ratio (for Oswald efficiency calculation)
   * @returns Estimated drag polar, or null if insufficient data
   */
  estimate(aspectRatio: number = 8): DragPolar | null {
    if (this.observations.length < 2) {
      return null;
    }

    // Least squares fit: y = a + b*x where x = CL^2, y = CD
    const n = this.observations.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;

    for (const obs of this.observations) {
      const x = obs.cl ** 2;
      const y = obs.cd;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x ** 2;
      sumY2 += y ** 2;
    }

    const denom = n * sumX2 - sumX ** 2;
    if (Math.abs(denom) < 1e-12) {
      return null;
    }

    const k = (n * sumXY - sumX * sumY) / denom;
    const cd0 = (sumY - k * sumX) / n;

    // R-squared
    const yMean = sumY / n;
    let ssTot = 0;
    let ssRes = 0;
    for (const obs of this.observations) {
      const x = obs.cl ** 2;
      const yPred = cd0 + k * x;
      ssTot += (obs.cd - yMean) ** 2;
      ssRes += (obs.cd - yPred) ** 2;
    }
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    // Calculate Oswald efficiency: k = 1 / (pi * e * AR)
    const oswald =
      k > 0 ? 1 / (Math.PI * k * aspectRatio) : 0;

    // Average Mach of observations
    const avgMach =
      this.observations.reduce((sum, o) => sum + o.mach, 0) / n;

    return {
      cd0: Math.max(0, cd0),
      k: Math.max(0, k),
      oswald: Math.min(1, Math.max(0, oswald)),
      aspectRatio,
      mach: avgMach,
      rSquared,
    };
  }

  /**
   * Estimate the minimum drag speed for a given altitude and weight.
   *
   * At minimum drag, CL = sqrt(CD0 / k), which gives (L/D)max.
   */
  minimumDragCL(polar: DragPolar): number {
    if (polar.k <= 0) return 0;
    return Math.sqrt(polar.cd0 / polar.k);
  }

  /**
   * Calculate the maximum lift-to-drag ratio from a drag polar.
   */
  maxLiftToDrag(polar: DragPolar): number {
    if (polar.cd0 <= 0 || polar.k <= 0) return 0;
    return 1 / (2 * Math.sqrt(polar.cd0 * polar.k));
  }
}
