import type { FlightState } from "@flightdna/core";
import type { HealthIndicator, HealthIndicatorType } from "./types";

/**
 * Health monitoring for aircraft digital twins.
 *
 * Tracks long-term trends in engine performance, structural fatigue,
 * fuel efficiency, and navigation accuracy using statistical baselines.
 */
export class HealthMonitor {
  private indicators = new Map<HealthIndicatorType, HealthIndicator>();
  private history: Array<{
    timestamp: number;
    climbRate: number;
    groundSpeed: number;
    altitude: number;
  }> = [];
  private readonly maxHistory = 1000;

  constructor() {
    this.initializeIndicators();
  }

  /**
   * Update health indicators with a new flight state.
   */
  update(state: FlightState): void {
    this.history.push({
      timestamp: state.timestamp,
      climbRate: state.velocity.verticalRate,
      groundSpeed: state.velocity.groundSpeed,
      altitude: state.position.altitude,
    });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    this.updateEngineHealth(state);
    this.updateStructuralFatigue(state);
    this.updateFuelEfficiency(state);
    this.updateNavigationAccuracy(state);
    this.updateOverallHealth();
  }

  /**
   * Get all current health indicators.
   */
  getIndicators(): HealthIndicator[] {
    return Array.from(this.indicators.values());
  }

  /**
   * Get a specific health indicator.
   */
  getIndicator(type: HealthIndicatorType): HealthIndicator | undefined {
    return this.indicators.get(type);
  }

  /**
   * Reset all health indicators to default values.
   */
  reset(): void {
    this.history = [];
    this.cumulativeCycles = 0;
    this.lastAltDirection = 0;
    this.initializeIndicators();
  }

  private initializeIndicators(): void {
    const types: HealthIndicatorType[] = [
      "engine_performance",
      "structural_fatigue",
      "fuel_efficiency",
      "navigation_accuracy",
      "overall",
    ];

    for (const type of types) {
      this.indicators.set(type, {
        type,
        value: 1.0,
        trend: 0,
        confidence: 0,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Update engine health based on climb performance.
   *
   * If the aircraft's observed climb rate degrades over time at
   * similar conditions, this may indicate engine performance loss.
   */
  private updateEngineHealth(state: FlightState): void {
    const indicator = this.indicators.get("engine_performance")!;
    const confidence = Math.min(1, this.history.length / 100);

    // Compare recent climb performance to baseline
    if (this.history.length > 20) {
      const recentClimbs = this.history
        .slice(-20)
        .filter((h) => h.climbRate > 1)
        .map((h) => h.climbRate);

      const baselineClimbs = this.history
        .slice(0, Math.min(50, this.history.length))
        .filter((h) => h.climbRate > 1)
        .map((h) => h.climbRate);

      if (recentClimbs.length > 0 && baselineClimbs.length > 0) {
        const recentAvg = this.mean(recentClimbs);
        const baselineAvg = this.mean(baselineClimbs);
        const ratio = baselineAvg > 0 ? recentAvg / baselineAvg : 1;
        indicator.value = Math.min(1, Math.max(0, ratio));
        indicator.trend = ratio - 1;
      }
    }

    indicator.confidence = confidence;
    indicator.timestamp = state.timestamp;
  }

  /**
   * Track structural fatigue accumulation.
   *
   * Counts load cycles (significant altitude reversals) as a proxy
   * for fatigue damage accumulation. The cycle counter is cumulative
   * rather than recomputed from the rolling window each update.
   */
  private cumulativeCycles = 0;
  private lastAltDirection: number = 0;

  private updateStructuralFatigue(state: FlightState): void {
    const indicator = this.indicators.get("structural_fatigue")!;

    if (this.history.length >= 2) {
      const prev = this.history[this.history.length - 2];
      const curr = this.history[this.history.length - 1];
      const altChange = curr.altitude - prev.altitude;

      // Detect altitude reversal (sign change with significant magnitude)
      if (this.lastAltDirection !== 0 && altChange !== 0) {
        const currentDir = Math.sign(altChange);
        if (currentDir !== this.lastAltDirection && Math.abs(altChange) > 30) {
          this.cumulativeCycles++;
        }
      }

      if (Math.abs(altChange) > 10) {
        this.lastAltDirection = Math.sign(altChange);
      }
    }

    // Normalize: typical flight has 2-10 major altitude reversals
    // After ~100 tracked flights worth of cycles, start showing wear
    const fatigueIndex = Math.min(1, this.cumulativeCycles / 500);
    indicator.value = 1 - fatigueIndex;
    indicator.trend = this.cumulativeCycles > 10 ? -fatigueIndex / this.cumulativeCycles : 0;
    indicator.confidence = Math.min(1, this.cumulativeCycles / 20);
    indicator.timestamp = state.timestamp;
  }

  /**
   * Track fuel efficiency trends (proxy via speed/altitude performance).
   */
  private updateFuelEfficiency(state: FlightState): void {
    const indicator = this.indicators.get("fuel_efficiency")!;
    // Without direct fuel data, maintain at baseline
    indicator.confidence = Math.min(0.3, this.history.length / 500);
    indicator.timestamp = state.timestamp;
  }

  /**
   * Assess navigation accuracy from position consistency.
   */
  private updateNavigationAccuracy(state: FlightState): void {
    const indicator = this.indicators.get("navigation_accuracy")!;

    if (this.history.length > 5) {
      // Check for position jumps that indicate GPS issues
      const last5 = this.history.slice(-5);
      let jumpCount = 0;
      for (let i = 1; i < last5.length; i++) {
        const speedChange = Math.abs(
          last5[i].groundSpeed - last5[i - 1].groundSpeed,
        );
        if (speedChange > 100) jumpCount++;
      }
      indicator.value = jumpCount === 0 ? 1.0 : Math.max(0.5, 1 - jumpCount * 0.1);
    }

    indicator.confidence = Math.min(1, this.history.length / 50);
    indicator.timestamp = state.timestamp;
  }

  /**
   * Compute overall health as a weighted average.
   */
  private updateOverallHealth(): void {
    const overall = this.indicators.get("overall")!;
    const weights: Record<HealthIndicatorType, number> = {
      engine_performance: 0.35,
      structural_fatigue: 0.25,
      fuel_efficiency: 0.2,
      navigation_accuracy: 0.2,
      overall: 0,
    };

    let weightedSum = 0;
    let totalWeight = 0;
    let avgConfidence = 0;

    for (const [type, indicator] of this.indicators) {
      if (type === "overall") continue;
      const w = weights[type];
      weightedSum += indicator.value * w * indicator.confidence;
      totalWeight += w * indicator.confidence;
      avgConfidence += indicator.confidence;
    }

    overall.value = totalWeight > 0 ? weightedSum / totalWeight : 1;
    overall.confidence = avgConfidence / 4;
    overall.trend = 0;
    overall.timestamp = Date.now();
  }

  private mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
}
