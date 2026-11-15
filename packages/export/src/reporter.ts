import type { FlightState } from "@flightdna/core";
import type { FlightSummary, PerformanceReport } from "./types";

/**
 * Flight report generator.
 *
 * Produces summary and performance reports from flight state data.
 */
export class FlightReporter {
  /**
   * Generate a flight summary from an array of flight states.
   */
  generateSummary(states: FlightState[]): FlightSummary {
    if (states.length === 0) {
      throw new Error("Cannot generate summary from empty state array");
    }

    const first = states[0];
    const last = states[states.length - 1];

    let maxAltitude = 0;
    let maxGroundSpeed = 0;
    let maxVerticalRate = 0;
    let totalSpeed = 0;
    let totalDistance = 0;

    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      maxAltitude = Math.max(maxAltitude, s.position.altitude);
      maxGroundSpeed = Math.max(maxGroundSpeed, s.velocity.groundSpeed);
      maxVerticalRate = Math.max(
        maxVerticalRate,
        Math.abs(s.velocity.verticalRate),
      );
      totalSpeed += s.velocity.groundSpeed;

      if (i > 0) {
        totalDistance += this.haversineDistance(
          states[i - 1].position.latitude,
          states[i - 1].position.longitude,
          s.position.latitude,
          s.position.longitude,
        );
      }
    }

    return {
      icao24: first.aircraft.icao24,
      callsign: first.aircraft.callsign,
      startTime: first.timestamp,
      endTime: last.timestamp,
      duration: (last.timestamp - first.timestamp) / 1000,
      dataPoints: states.length,
      startPosition: {
        latitude: first.position.latitude,
        longitude: first.position.longitude,
        altitude: first.position.altitude,
      },
      endPosition: {
        latitude: last.position.latitude,
        longitude: last.position.longitude,
        altitude: last.position.altitude,
      },
      maxAltitude,
      maxGroundSpeed,
      avgGroundSpeed: totalSpeed / states.length,
      maxVerticalRate,
      totalDistance,
    };
  }

  /**
   * Generate a detailed performance report.
   */
  generatePerformanceReport(states: FlightState[]): PerformanceReport {
    const summary = this.generateSummary(states);

    const altitudeProfile: Array<[number, number]> = [];
    const speedProfile: Array<[number, number]> = [];
    const verticalRateProfile: Array<[number, number]> = [];

    let climbCount = 0;
    let cruiseCount = 0;
    let descentCount = 0;
    let groundCount = 0;

    for (const s of states) {
      altitudeProfile.push([s.timestamp, s.position.altitude]);
      speedProfile.push([s.timestamp, s.velocity.groundSpeed]);
      verticalRateProfile.push([s.timestamp, s.velocity.verticalRate]);

      if (s.onGround) {
        groundCount++;
      } else if (s.velocity.verticalRate > 1) {
        climbCount++;
      } else if (s.velocity.verticalRate < -1) {
        descentCount++;
      } else {
        cruiseCount++;
      }
    }

    const total = states.length || 1;

    return {
      summary,
      altitudeProfile,
      speedProfile,
      verticalRateProfile,
      phaseBreakdown: {
        climb: climbCount / total,
        cruise: cruiseCount / total,
        descent: descentCount / total,
        ground: groundCount / total,
      },
    };
  }

  /**
   * Format a flight summary as human-readable text.
   */
  formatSummaryText(summary: FlightSummary): string {
    const lines = [
      `Flight Summary`,
      `==============`,
      `Aircraft:    ${summary.icao24}${summary.callsign ? ` (${summary.callsign})` : ""}`,
      `Duration:    ${this.formatDuration(summary.duration)}`,
      `Data points: ${summary.dataPoints}`,
      ``,
      `Positions:`,
      `  Start:     ${summary.startPosition.latitude.toFixed(4)}, ${summary.startPosition.longitude.toFixed(4)} @ ${Math.round(summary.startPosition.altitude)}m`,
      `  End:       ${summary.endPosition.latitude.toFixed(4)}, ${summary.endPosition.longitude.toFixed(4)} @ ${Math.round(summary.endPosition.altitude)}m`,
      `  Distance:  ${(summary.totalDistance / 1000).toFixed(1)} km`,
      ``,
      `Performance:`,
      `  Max alt:   ${Math.round(summary.maxAltitude)}m (${Math.round(summary.maxAltitude * 3.28084)} ft)`,
      `  Max speed: ${summary.maxGroundSpeed.toFixed(1)} m/s (${(summary.maxGroundSpeed * 1.94384).toFixed(0)} kts)`,
      `  Avg speed: ${summary.avgGroundSpeed.toFixed(1)} m/s (${(summary.avgGroundSpeed * 1.94384).toFixed(0)} kts)`,
      `  Max V/S:   ${summary.maxVerticalRate.toFixed(1)} m/s (${(summary.maxVerticalRate * 196.85).toFixed(0)} fpm)`,
    ];
    return lines.join("\n");
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
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
