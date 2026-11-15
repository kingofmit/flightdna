import type { FlightState } from "@flightdna/core";
import type { Anomaly, AnomalySeverity } from "./types";

/**
 * Anomaly detector for aircraft digital twins.
 *
 * Monitors flight states for deviations from expected performance
 * envelopes and behavioral patterns using statistical methods.
 */
export class AnomalyDetector {
  private anomalies = new Map<string, Anomaly>();
  private history: FlightState[] = [];
  private readonly maxHistory: number;
  private readonly sensitivity: number;
  private nextId = 1;

  // Running statistics for anomaly detection
  private stats = {
    speedMean: 0,
    speedM2: 0,
    altMean: 0,
    altM2: 0,
    vrMean: 0,
    vrM2: 0,
    count: 0,
  };

  constructor(options: { sensitivity?: number; maxHistory?: number } = {}) {
    this.sensitivity = options.sensitivity ?? 0.5;
    this.maxHistory = options.maxHistory ?? 500;
  }

  /**
   * Analyze a flight state for anomalies.
   *
   * @returns Any new anomalies detected
   */
  analyze(state: FlightState): Anomaly[] {
    this.history.push(state);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Update running statistics (Welford's online algorithm)
    this.updateStats(state);

    const detected: Anomaly[] = [];

    if (this.stats.count < 10) return detected;

    // Check for speed anomalies
    const speedAnomaly = this.checkSpeedAnomaly(state);
    if (speedAnomaly) detected.push(speedAnomaly);

    // Check for altitude anomalies
    const altAnomaly = this.checkAltitudeAnomaly(state);
    if (altAnomaly) detected.push(altAnomaly);

    // Check for vertical rate anomalies
    const vrAnomaly = this.checkVerticalRateAnomaly(state);
    if (vrAnomaly) detected.push(vrAnomaly);

    // Check for position jumps
    const jumpAnomaly = this.checkPositionJump(state);
    if (jumpAnomaly) detected.push(jumpAnomaly);

    return detected;
  }

  /**
   * Get all active anomalies.
   */
  getAnomalies(): Anomaly[] {
    return Array.from(this.anomalies.values());
  }

  /**
   * Clear resolved anomalies.
   */
  clearResolved(): void {
    // Remove anomalies that haven't been re-triggered in a while
    const cutoff = Date.now() - 300_000; // 5 minutes
    for (const [id, anomaly] of this.anomalies) {
      if (anomaly.detectedAt < cutoff) {
        this.anomalies.delete(id);
      }
    }
  }

  /**
   * Reset the detector.
   */
  reset(): void {
    this.anomalies.clear();
    this.history = [];
    this.stats = {
      speedMean: 0,
      speedM2: 0,
      altMean: 0,
      altM2: 0,
      vrMean: 0,
      vrM2: 0,
      count: 0,
    };
  }

  private updateStats(state: FlightState): void {
    this.stats.count++;
    const n = this.stats.count;

    // Welford's algorithm for running mean and variance
    const speedDelta = state.velocity.groundSpeed - this.stats.speedMean;
    this.stats.speedMean += speedDelta / n;
    this.stats.speedM2 += speedDelta * (state.velocity.groundSpeed - this.stats.speedMean);

    const altDelta = state.position.altitude - this.stats.altMean;
    this.stats.altMean += altDelta / n;
    this.stats.altM2 += altDelta * (state.position.altitude - this.stats.altMean);

    const vrDelta = state.velocity.verticalRate - this.stats.vrMean;
    this.stats.vrMean += vrDelta / n;
    this.stats.vrM2 += vrDelta * (state.velocity.verticalRate - this.stats.vrMean);
  }

  private stdDev(m2: number): number {
    if (this.stats.count < 2) return 0;
    return Math.sqrt(m2 / (this.stats.count - 1));
  }

  private checkSpeedAnomaly(state: FlightState): Anomaly | null {
    const std = this.stdDev(this.stats.speedM2);
    if (std < 1) return null;

    const deviation = Math.abs(state.velocity.groundSpeed - this.stats.speedMean) / std;
    const threshold = 3.0 * (1 - this.sensitivity * 0.5);

    if (deviation > threshold) {
      return this.createAnomaly(
        "speed_deviation",
        `Ground speed ${Math.round(state.velocity.groundSpeed)} m/s deviates ${deviation.toFixed(1)} sigma from mean`,
        deviation,
        state,
      );
    }
    return null;
  }

  private checkAltitudeAnomaly(state: FlightState): Anomaly | null {
    const std = this.stdDev(this.stats.altM2);
    if (std < 10) return null;

    const deviation = Math.abs(state.position.altitude - this.stats.altMean) / std;
    const threshold = 3.5 * (1 - this.sensitivity * 0.5);

    if (deviation > threshold) {
      return this.createAnomaly(
        "altitude_deviation",
        `Altitude ${Math.round(state.position.altitude)}m deviates ${deviation.toFixed(1)} sigma from mean`,
        deviation,
        state,
      );
    }
    return null;
  }

  private checkVerticalRateAnomaly(state: FlightState): Anomaly | null {
    // Extreme vertical rate (> 30 m/s ~ 6000 ft/min)
    if (Math.abs(state.velocity.verticalRate) > 30) {
      const deviation = Math.abs(state.velocity.verticalRate) / 10;
      return this.createAnomaly(
        "extreme_vertical_rate",
        `Extreme vertical rate: ${Math.round(state.velocity.verticalRate)} m/s`,
        deviation,
        state,
      );
    }
    return null;
  }

  private checkPositionJump(state: FlightState): Anomaly | null {
    if (this.history.length < 2) return null;

    const prev = this.history[this.history.length - 2];
    const dt = (state.timestamp - prev.timestamp) / 1000;
    if (dt <= 0 || dt > 60) return null; // Skip if gap too large

    // Expected max distance based on speed and time
    const maxExpected = prev.velocity.groundSpeed * dt * 2;
    const actualDist = this.haversineDistance(
      prev.position.latitude,
      prev.position.longitude,
      state.position.latitude,
      state.position.longitude,
    );

    if (maxExpected > 100 && actualDist > maxExpected * 3) {
      const deviation = actualDist / maxExpected;
      return this.createAnomaly(
        "position_jump",
        `Position jump: ${Math.round(actualDist)}m in ${dt.toFixed(0)}s (expected max ${Math.round(maxExpected)}m)`,
        deviation,
        state,
      );
    }
    return null;
  }

  private createAnomaly(
    type: string,
    message: string,
    deviation: number,
    state: FlightState,
  ): Anomaly {
    const severity: AnomalySeverity =
      deviation > 5 ? "critical" : deviation > 3 ? "warning" : "info";

    const anomaly: Anomaly = {
      id: `anomaly-${this.nextId++}`,
      type,
      message,
      severity,
      deviation,
      detectedAt: Date.now(),
      triggerState: state,
    };

    this.anomalies.set(anomaly.id, anomaly);
    return anomaly;
  }

  private haversineDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number,
  ): number {
    const R = 6_371_000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
}
