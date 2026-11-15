import type { FlightState } from "@flightdna/core";
import { AnomalyDetector } from "./anomaly";
import { HealthMonitor } from "./health";
import { KalmanFilter } from "./kalman";
import type { TwinConfig, TwinState } from "./types";

/**
 * DigitalTwin — maintains a real-time model of a single aircraft.
 *
 * Fuses ADS-B measurements with a motion model via Kalman filtering,
 * tracks health indicators, and detects behavioral anomalies.
 */
export class DigitalTwin {
  private readonly config: TwinConfig;
  private readonly kalman: KalmanFilter;
  private readonly health: HealthMonitor;
  private readonly anomalyDetector: AnomalyDetector;
  private lastState: FlightState | null = null;
  private firstTimestamp: number | null = null;
  private updateCount = 0;

  constructor(config: TwinConfig) {
    this.config = config;

    this.kalman = new KalmanFilter({
      processNoise: config.processNoise ?? 1.0,
      positionNoise: config.measurementNoise ?? 50,
    });

    this.health = new HealthMonitor();

    this.anomalyDetector = new AnomalyDetector({
      sensitivity: config.anomalySensitivity ?? 0.5,
    });
  }

  /**
   * Feed a new flight state measurement into the twin.
   */
  update(state: FlightState): void {
    if (this.firstTimestamp === null) {
      this.firstTimestamp = state.timestamp;
    }

    this.updateCount++;

    // Convert flight state to Kalman measurement vector
    const measurement = [
      state.position.latitude,
      state.position.longitude,
      state.position.altitude,
      state.velocity.groundSpeed * Math.cos((state.velocity.track * Math.PI) / 180),
      state.velocity.groundSpeed * Math.sin((state.velocity.track * Math.PI) / 180),
      -state.velocity.verticalRate,
    ];

    this.kalman.update(measurement, state.timestamp);

    if (this.config.healthMonitoring !== false) {
      this.health.update(state);
    }

    if (this.config.anomalyDetection !== false) {
      this.anomalyDetector.analyze(state);
    }

    this.lastState = state;
  }

  /**
   * Get the current estimated state of the digital twin.
   */
  getState(): TwinState {
    const kState = this.kalman.getState();
    const [lat, lon, alt, vN, vE, vD] = kState.x;

    const groundSpeed = Math.sqrt(vN ** 2 + vE ** 2);
    const track = ((Math.atan2(vE, vN) * 180) / Math.PI + 360) % 360;
    const verticalRate = -vD;

    // Rough Mach estimate (assume speed of sound ~ 295 m/s at cruise altitude)
    const speedOfSound = alt > 8000 ? 295 : 340 - alt * 0.004;
    const mach = groundSpeed / speedOfSound;

    const flightHours = this.firstTimestamp
      ? (Date.now() - this.firstTimestamp) / 3_600_000
      : 0;

    return {
      icao24: this.config.icao24,
      timestamp: kState.timestamp,
      position: {
        latitude: lat,
        longitude: lon,
        altitude: alt,
      },
      velocity: {
        groundSpeed,
        track,
        verticalRate,
      },
      performance: {
        mach,
        climbRate: verticalRate,
      },
      health: this.health.getIndicators(),
      anomalies: this.anomalyDetector.getAnomalies(),
      flightHours,
      updateCount: this.updateCount,
      airborne: this.lastState ? !this.lastState.onGround : false,
    };
  }

  /**
   * Get the raw last flight state (unfiltered).
   */
  getLastRawState(): FlightState | null {
    return this.lastState;
  }

  /**
   * Whether the twin has received any updates.
   */
  get isInitialized(): boolean {
    return this.kalman.isInitialized;
  }

  /**
   * Number of updates received.
   */
  get updates(): number {
    return this.updateCount;
  }

  /**
   * Reset the twin to its initial state.
   */
  reset(): void {
    this.lastState = null;
    this.firstTimestamp = null;
    this.updateCount = 0;
    this.health.reset();
    this.anomalyDetector.reset();
  }
}
