/**
 * Aircraft noise impact modeling for environmental analysis.
 *
 * Implements a simplified version of the INM (Integrated Noise Model) approach
 * used for airport noise contour estimation. Suitable for planning-level
 * assessments; not intended for regulatory certification analysis.
 */

import type { Position } from "@flightdna/core";

export interface NoiseEstimate {
  /** Sound exposure level in dBA at the observer position */
  sel: number;
  /** Maximum sound level in dBA */
  lmax: number;
  /** Perceived noise level in EPNdB (effective perceived noise) */
  epnl: number;
  /** Slant distance from aircraft to observer in meters */
  slantDistance: number;
  /** Observer position */
  observer: Position;
}

export interface NoiseSourceParams {
  /** Reference SEL at 1000ft (305m) distance in dBA */
  referenceSEL: number;
  /** Number of engines */
  engineCount: number;
  /** Engine type (affects spectral characteristics) */
  engineType: "turbofan" | "turboprop" | "piston";
  /** Aircraft category for noise purposes */
  category: "heavy" | "large" | "small";
}

/**
 * Aircraft noise model based on simplified INM methodology.
 *
 * Estimates noise levels at ground observer positions from
 * aircraft position, speed, and engine characteristics.
 *
 * Key assumptions:
 * - Point source model (no directivity pattern)
 * - Inverse square law for distance attenuation
 * - Atmospheric absorption per SAE AIR 1845
 * - Ground reflection adds ~3 dB
 */
export class NoiseModel {
  /**
   * Estimate noise at an observer position from an aircraft state.
   */
  estimateNoise(
    aircraftPosition: Position,
    aircraftSpeed: number,
    sourceParams: NoiseSourceParams,
    observerPosition: Position,
  ): NoiseEstimate {
    // Slant distance from aircraft to observer
    const horizontalDist = this.haversineDistance(
      aircraftPosition.latitude,
      aircraftPosition.longitude,
      observerPosition.latitude,
      observerPosition.longitude,
    );
    const altitudeAboveObserver =
      aircraftPosition.altitude - observerPosition.altitude;
    const slantDistance = Math.sqrt(
      horizontalDist ** 2 + altitudeAboveObserver ** 2,
    );

    if (slantDistance < 1) {
      return {
        sel: 120,
        lmax: 120,
        epnl: 120,
        slantDistance: 1,
        observer: observerPosition,
      };
    }

    // Reference distance (1000 ft = 304.8 m)
    const refDistance = 304.8;

    // Distance attenuation (inverse square law in dB)
    // ΔdB = 20 * log10(d / d_ref)
    const distanceAttenuation = 20 * Math.log10(slantDistance / refDistance);

    // Atmospheric absorption (simplified, ~0.5 dB per 100m above 300m)
    const excessDistance = Math.max(0, slantDistance - refDistance);
    const atmosphericAbsorption = 0.005 * excessDistance;

    // Ground reflection bonus (~3 dB for hard surface, ~1.5 dB average)
    const groundReflection = altitudeAboveObserver < 1000 ? 2 : 0;

    // Engine count adjustment: 10 * log10(N)
    const engineAdjustment = 10 * Math.log10(sourceParams.engineCount);

    // Speed adjustment: faster = shorter exposure time for SEL
    // Duration correction: 10 * log10(v_ref / v) where v_ref = 160 kts
    const refSpeed = 82.3; // 160 knots in m/s
    const speedCorrection =
      aircraftSpeed > 10
        ? 10 * Math.log10(refSpeed / aircraftSpeed)
        : 0;

    // Compute SEL
    const sel =
      sourceParams.referenceSEL -
      distanceAttenuation -
      atmosphericAbsorption +
      groundReflection +
      engineAdjustment +
      speedCorrection;

    // Lmax is typically SEL - 10*log10(exposure_time)
    // For a flyover, Lmax ≈ SEL - 7 dB (typical correction)
    const lmax = sel - 7;

    // EPNL ≈ SEL + tonal correction for engine type
    const tonalCorrection =
      sourceParams.engineType === "turbofan"
        ? 13
        : sourceParams.engineType === "turboprop"
          ? 10
          : 6;
    const epnl = sel + tonalCorrection - 10; // Approximate

    return {
      sel: Math.max(0, Math.round(sel * 10) / 10),
      lmax: Math.max(0, Math.round(lmax * 10) / 10),
      epnl: Math.max(0, Math.round(epnl * 10) / 10),
      slantDistance: Math.round(slantDistance),
      observer: observerPosition,
    };
  }

  /**
   * Compute a noise contour (set of points at a given noise level)
   * for an aircraft at a fixed position.
   *
   * Returns an array of [lat, lon] pairs forming the contour.
   */
  computeContour(
    aircraftPosition: Position,
    aircraftSpeed: number,
    sourceParams: NoiseSourceParams,
    targetSEL: number,
    numPoints: number = 36,
  ): Array<{ latitude: number; longitude: number }> {
    // Binary search for the distance at which SEL = targetSEL
    // at ground level (observer altitude = 0)
    let low = 10; // 10 meters
    let high = 50_000; // 50 km

    for (let iter = 0; iter < 30; iter++) {
      const mid = (low + high) / 2;
      // Create observer at this distance directly below
      const testObserver: Position = {
        latitude: aircraftPosition.latitude,
        longitude: aircraftPosition.longitude,
        altitude: 0,
      };
      // Adjust slant distance calculation
      const altAbove = aircraftPosition.altitude;
      const horizDist = Math.sqrt(Math.max(0, mid ** 2 - altAbove ** 2));
      if (horizDist <= 0) {
        low = mid;
        continue;
      }

      // Move observer to this horizontal distance (due north for test)
      const testLat = aircraftPosition.latitude + horizDist / 111320;
      testObserver.latitude = testLat;

      const estimate = this.estimateNoise(
        aircraftPosition,
        aircraftSpeed,
        sourceParams,
        testObserver,
      );

      if (estimate.sel > targetSEL) {
        low = mid;
      } else {
        high = mid;
      }
    }

    const contourRadius = (low + high) / 2;
    const horizRadius = Math.sqrt(
      Math.max(0, contourRadius ** 2 - aircraftPosition.altitude ** 2),
    );

    // Generate points around the circle
    const points: Array<{ latitude: number; longitude: number }> = [];
    for (let i = 0; i < numPoints; i++) {
      const angle = (2 * Math.PI * i) / numPoints;
      const dLat = (horizRadius * Math.cos(angle)) / 111320;
      const dLon =
        (horizRadius * Math.sin(angle)) /
        (111320 *
          Math.cos((aircraftPosition.latitude * Math.PI) / 180));
      points.push({
        latitude: aircraftPosition.latitude + dLat,
        longitude: aircraftPosition.longitude + dLon,
      });
    }

    return points;
  }

  /**
   * Get default noise source parameters for common aircraft types.
   */
  static getDefaultParams(typeDesignator: string): NoiseSourceParams | null {
    // Reference SEL values at 1000ft for common types
    // (approximate, from FAA INM database)
    const db: Record<string, NoiseSourceParams> = {
      B738: {
        referenceSEL: 92,
        engineCount: 2,
        engineType: "turbofan",
        category: "large",
      },
      A320: {
        referenceSEL: 91,
        engineCount: 2,
        engineType: "turbofan",
        category: "large",
      },
      B77W: {
        referenceSEL: 97,
        engineCount: 2,
        engineType: "turbofan",
        category: "heavy",
      },
      A388: {
        referenceSEL: 99,
        engineCount: 4,
        engineType: "turbofan",
        category: "heavy",
      },
      B744: {
        referenceSEL: 98,
        engineCount: 4,
        engineType: "turbofan",
        category: "heavy",
      },
      A359: {
        referenceSEL: 93,
        engineCount: 2,
        engineType: "turbofan",
        category: "heavy",
      },
      B789: {
        referenceSEL: 93,
        engineCount: 2,
        engineType: "turbofan",
        category: "heavy",
      },
      E190: {
        referenceSEL: 87,
        engineCount: 2,
        engineType: "turbofan",
        category: "large",
      },
      CRJ9: {
        referenceSEL: 85,
        engineCount: 2,
        engineType: "turbofan",
        category: "large",
      },
      AT76: {
        referenceSEL: 82,
        engineCount: 2,
        engineType: "turboprop",
        category: "small",
      },
      DH8D: {
        referenceSEL: 84,
        engineCount: 2,
        engineType: "turboprop",
        category: "small",
      },
      C172: {
        referenceSEL: 68,
        engineCount: 1,
        engineType: "piston",
        category: "small",
      },
    };
    return db[typeDesignator.toUpperCase()] ?? null;
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
    return 2 * R * Math.asin(Math.sqrt(Math.max(0, a)));
  }
}
