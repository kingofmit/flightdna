import type { FlightState } from "@flightdna/core";

/**
 * Turbulence intensity categories based on ICAO EDR thresholds.
 */
export type TurbulenceIntensity = "none" | "light" | "moderate" | "severe" | "extreme";

/**
 * Turbulence estimate derived from ADS-B trajectory perturbations.
 */
export interface TurbulenceEstimate {
  /** EDR-like metric (cube root of eddy dissipation rate) in m^(2/3)/s */
  edr: number;
  /** Qualitative intensity */
  intensity: TurbulenceIntensity;
  /** Altitude band where detected (meters MSL) */
  altitude: number;
  /** Position where detected */
  latitude: number;
  longitude: number;
  /** Confidence (0-1) based on data quality */
  confidence: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Turbulence detector from ADS-B trajectory perturbations.
 *
 * During cruise (steady altitude, steady speed), altitude and vertical rate
 * variance indicate turbulence. Computes an EDR-like metric from vertical
 * rate standard deviation scaled by true airspeed.
 */
export class TurbulenceDetector {
  private readonly windowSize: number;
  private altitudeBuffer: number[] = [];
  private vrateBuffer: number[] = [];
  private speedBuffer: number[] = [];
  private positionBuffer: Array<{ lat: number; lon: number; alt: number; timestamp: number }> = [];

  constructor(options: { windowSize?: number } = {}) {
    this.windowSize = options.windowSize ?? 30; // 30 samples (~5 min at 10s updates)
  }

  /**
   * Process a flight state and return turbulence estimate if in cruise.
   * Returns null if not enough data or not in cruise-like conditions.
   */
  update(state: FlightState): TurbulenceEstimate | null {
    this.altitudeBuffer.push(state.position.altitude);
    this.vrateBuffer.push(state.velocity.verticalRate);
    this.speedBuffer.push(state.velocity.groundSpeed);
    this.positionBuffer.push({
      lat: state.position.latitude,
      lon: state.position.longitude,
      alt: state.position.altitude,
      timestamp: state.timestamp,
    });

    // Keep window size
    if (this.altitudeBuffer.length > this.windowSize) {
      this.altitudeBuffer.shift();
      this.vrateBuffer.shift();
      this.speedBuffer.shift();
      this.positionBuffer.shift();
    }

    if (this.altitudeBuffer.length < 10) return null;

    // Only detect turbulence in cruise-like conditions:
    // altitude > 6000m (FL200+), speed > 100 m/s
    const altMean = mean(this.altitudeBuffer);
    const altStd = stdDev(this.altitudeBuffer);
    const speedMean = mean(this.speedBuffer);

    if (altMean < 6000 || speedMean < 100) return null;

    // If altitude is changing systematically (climb/descent), not cruise
    const altTrend = this.linearTrend(this.altitudeBuffer);
    if (Math.abs(altTrend) > 2) return null; // > 2 m/s systematic climb/descent

    // Compute EDR-like metric from vertical rate variance
    // True EDR = (σ_w² / (1.05 * C * V_TAS))^(1/3) where C ≈ 2, V_TAS in m/s
    // We approximate: σ_w from vertical rate variance
    const vrStd = stdDev(this.vrateBuffer);

    // EDR approximation: scale vertical rate variance
    // σ_w in m/s, typical TAS ~230 m/s at cruise
    const tas = speedMean; // approximate
    const edr = tas > 0 ? Math.pow((vrStd * vrStd) / (2.1 * tas), 1 / 3) : 0;

    const intensity = this.classifyIntensity(edr);

    // Confidence based on sample size and stationarity
    const confidence = Math.min(1, this.altitudeBuffer.length / this.windowSize) *
      (altStd < 100 ? 1 : 0.5); // Lower confidence if altitude is varying a lot

    const lastPos = this.positionBuffer[this.positionBuffer.length - 1];

    return {
      edr: Math.round(edr * 1000) / 1000,
      intensity,
      altitude: altMean,
      latitude: lastPos.lat,
      longitude: lastPos.lon,
      confidence: Math.round(confidence * 100) / 100,
      timestamp: lastPos.timestamp,
    };
  }

  /**
   * Reset all internal buffers.
   */
  reset(): void {
    this.altitudeBuffer = [];
    this.vrateBuffer = [];
    this.speedBuffer = [];
    this.positionBuffer = [];
  }

  /**
   * Classify EDR into turbulence intensity categories.
   * Based on ICAO EDR thresholds:
   *   Light:    0.1-0.2 m^(2/3)/s
   *   Moderate: 0.2-0.4
   *   Severe:   0.4-0.6
   *   Extreme:  > 0.6
   */
  private classifyIntensity(edr: number): TurbulenceIntensity {
    if (edr < 0.1) return "none";
    if (edr < 0.2) return "light";
    if (edr < 0.4) return "moderate";
    if (edr < 0.6) return "severe";
    return "extreme";
  }

  /**
   * Compute linear trend (slope) of a buffer in units/sample.
   */
  private linearTrend(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-12) return 0;
    return (n * sumXY - sumX * sumY) / denom;
  }
}

/** Arithmetic mean of an array. */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Sample standard deviation. */
function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(Math.max(0, variance));
}
