import type { FlightState } from "@flightdna/core";
import type { FlightPhase } from "./types";

interface PhaseHistoryEntry {
  phase: FlightPhase;
  timestamp: number;
}

/**
 * Detects the current flight phase from sequential FlightState updates.
 *
 * Uses hysteresis (3 consecutive matching samples) to prevent noisy
 * phase transitions.
 */
export class FlightPhaseDetector {
  private currentPhase: FlightPhase = "unknown";
  private candidatePhase: FlightPhase = "unknown";
  private candidateCount = 0;
  private readonly hysteresis: number;
  private wasAirborne = false;
  private history: PhaseHistoryEntry[] = [];
  private readonly maxHistory = 500;

  constructor(hysteresis = 3) {
    this.hysteresis = hysteresis;
  }

  /**
   * Feed a new flight state and return the current (stable) phase.
   */
  update(state: FlightState): FlightPhase {
    const detected = this.classify(state);

    if (detected === this.currentPhase) {
      this.candidatePhase = detected;
      this.candidateCount = 0;
    } else if (detected === this.candidatePhase) {
      this.candidateCount++;
      if (this.candidateCount >= this.hysteresis) {
        this.currentPhase = detected;
        this.candidateCount = 0;
        this.history.push({ phase: detected, timestamp: state.timestamp });
        if (this.history.length > this.maxHistory) this.history.shift();
      }
    } else {
      this.candidatePhase = detected;
      this.candidateCount = 1;
    }

    // Track airborne state for takeoff/landing transitions
    const airborne = !state.onGround && state.position.altitude > 100;
    if (airborne) this.wasAirborne = true;
    if (state.onGround && state.velocity.groundSpeed < 10) this.wasAirborne = false;

    return this.currentPhase;
  }

  getPhase(): FlightPhase {
    return this.currentPhase;
  }

  getHistory(): PhaseHistoryEntry[] {
    return [...this.history];
  }

  reset(): void {
    this.currentPhase = "unknown";
    this.candidatePhase = "unknown";
    this.candidateCount = 0;
    this.wasAirborne = false;
    this.history = [];
  }

  private classify(state: FlightState): FlightPhase {
    const alt = state.position.altitude;
    const gs = state.velocity.groundSpeed;
    const vr = state.velocity.verticalRate;
    const onGround = state.onGround;

    // Ground
    if (onGround || (alt < 100 && gs < 30)) {
      return "ground";
    }

    // Landing: was airborne, now low altitude, descending, slow
    if (this.wasAirborne && alt < 100 && vr < -0.5 && gs < 80) {
      return "landing";
    }

    // Takeoff: was on ground, accelerating, climbing, low altitude
    if (!this.wasAirborne && gs > 30 && vr > 1 && alt < 500) {
      return "takeoff";
    }

    // Approach: descending at moderate altitude and speed
    if (vr < -1 && alt < 3000 && gs < 130) {
      return "approach";
    }

    // Cruise: level flight at high altitude and speed
    if (Math.abs(vr) < 1.5 && alt > 3000 && gs > 100) {
      return "cruise";
    }

    // Climb
    if (vr > 1.5 && alt > 500) {
      return "climb";
    }

    // Descent
    if (vr < -1.5 && alt > 500) {
      return "descent";
    }

    return "unknown";
  }
}
