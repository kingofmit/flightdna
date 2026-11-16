import type { FlightState } from "@flightdna/core";
import { AnomalyDetector } from "./anomaly";
import { FlightPhaseDetector } from "./flight-phase";
import { HealthMonitor } from "./health";
import { KalmanFilter } from "./kalman";
import type { TwinConfig, TwinState } from "./types";

/**
 * DigitalTwin — maintains a real-time model of a single aircraft.
 *
 * Fuses ADS-B measurements with a motion model via Kalman filtering,
 * tracks health indicators, detects behavioral anomalies, and
 * classifies the current flight phase.
 */
export class DigitalTwin {
  private readonly config: TwinConfig;
  private readonly kalman: KalmanFilter;
  private readonly health: HealthMonitor;
  private readonly anomalyDetector: AnomalyDetector;
  private readonly phaseDetector: FlightPhaseDetector;
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

    this.phaseDetector = new FlightPhaseDetector();
  }

  /**
   * Feed a new flight state measurement into the twin.
   */
  update(state: FlightState): void {
    // Reject invalid coordinates
    if (!Number.isFinite(state.position.latitude) ||
        !Number.isFinite(state.position.longitude) ||
        Math.abs(state.position.latitude) > 90 ||
        Math.abs(state.position.longitude) > 180) {
      return;
    }

    if (this.firstTimestamp === null) {
      this.firstTimestamp = state.timestamp;
    }

    this.updateCount++;

    // Convert flight state to 6-element Kalman measurement vector
    const measurement = [
      state.position.latitude,
      state.position.longitude,
      state.position.altitude,
      state.velocity.groundSpeed * Math.cos((state.velocity.track * Math.PI) / 180),
      state.velocity.groundSpeed * Math.sin((state.velocity.track * Math.PI) / 180),
      -state.velocity.verticalRate,
    ];

    this.kalman.update(measurement, state.timestamp);

    this.phaseDetector.update(state);

    if (this.config.healthMonitoring !== false) {
      this.health.update(state);
    }

    if (this.config.anomalyDetection !== false) {
      this.anomalyDetector.analyze(state, this.phaseDetector.getPhase());
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

    // Speed of sound from ISA: a = sqrt(γ * R * T)
    // Troposphere: T = 288.15 - 0.0065 * alt
    // Stratosphere: T = 216.65
    const gamma = 1.4;
    const R = 287.058;
    const isaTemp = alt <= 11000
      ? Math.max(1, 288.15 - 0.0065 * alt)
      : 216.65;
    const speedOfSound = Math.sqrt(gamma * R * isaTemp);

    // Use TAS if available from last raw state, otherwise groundSpeed as approximation
    const airspeed = this.lastState?.velocity.trueAirspeed ?? groundSpeed;
    const mach = speedOfSound > 0 ? airspeed / speedOfSound : 0;

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
      flightPhase: this.phaseDetector.getPhase(),
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
    this.phaseDetector.reset();
  }
}
