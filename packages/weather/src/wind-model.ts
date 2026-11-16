import type { Wind } from "./types";

/**
 * Estimates wind at altitude from surface observations.
 *
 * Uses a logarithmic boundary layer profile below 1500m and
 * a thermal wind approximation above, with backing/veering
 * adjustment for the Ekman spiral in the boundary layer.
 *
 * Wind sign convention:
 * - `direction`: meteorological convention (degrees wind is blowing FROM, 0=North)
 * - `speed`: always positive (magnitude)
 * - `northComponent`: velocity of air mass in north direction (positive = air moves north = wind FROM south)
 * - `eastComponent`: velocity of air mass in east direction (positive = air moves east = wind FROM west)
 *
 * To compute TAS from ground velocity: TAS_vector = GS_vector - wind_component_vector
 */
export class WindModel {
  /**
   * Estimate wind at a target altitude given a surface observation.
   *
   * @param surfaceWind - Observed surface wind (from METAR, typically at 10m AGL)
   * @param targetAltitude - Target altitude in meters MSL
   * @param surfaceElevation - Station elevation in meters MSL (default: 0)
   */
  estimateAtAltitude(
    surfaceWind: Wind,
    targetAltitude: number,
    surfaceElevation: number = 0,
  ): Wind {
    if (!Number.isFinite(surfaceWind.speed) || surfaceWind.speed < 0) {
      return { speed: 0, direction: 0, northComponent: 0, eastComponent: 0 };
    }

    const agl = Math.max(10, targetAltitude - surfaceElevation);

    // Below boundary layer (~1500m AGL): logarithmic wind profile + Ekman spiral
    // Above: speed increases more gradually, direction stabilizes

    const boundaryLayerHeight = 1500; // meters
    const referenceHeight = 10; // METAR standard measurement height

    let speedRatio: number;
    let directionShift: number; // degrees, positive = clockwise (veering)

    if (agl <= boundaryLayerHeight) {
      // Power law wind profile: V(z) = V_ref * (z/z_ref)^alpha
      // alpha ≈ 0.143 for neutral stability over open terrain (1/7 power law)
      const alpha = 0.143;
      speedRatio = Math.pow(agl / referenceHeight, alpha);

      // Ekman spiral: wind veers ~10-30° from surface to top of boundary layer
      // in Northern Hemisphere. Use linear interpolation as approximation.
      const maxVeer = 20; // degrees
      directionShift = maxVeer * (agl / boundaryLayerHeight);
    } else {
      // Above boundary layer: geostrophic wind
      // Speed is roughly 1.5-2x surface wind, increasing slowly with altitude
      const blSpeedRatio = Math.pow(
        boundaryLayerHeight / referenceHeight,
        0.143,
      );
      // Gradual increase above BL (jet stream effects at higher altitudes)
      // Clamp to prevent extreme values at very high altitudes
      const aboveBLFactor = 1 + 0.1 * Math.min(Math.log(agl / boundaryLayerHeight), 5);
      speedRatio = blSpeedRatio * Math.min(aboveBLFactor, 4); // Cap at 4x surface wind

      // Direction is approximately geostrophic above BL (20° from surface)
      directionShift = 20;
    }

    const speed = surfaceWind.speed * speedRatio;
    const direction = (surfaceWind.direction + directionShift + 360) % 360;

    // Recompute N/E components from new speed/direction
    // Wind direction is "FROM" direction, so components are negative of that
    const dirRad = (direction * Math.PI) / 180;
    const northComponent = -speed * Math.cos(dirRad);
    const eastComponent = -speed * Math.sin(dirRad);

    return {
      speed,
      direction,
      northComponent,
      eastComponent,
    };
  }

  /**
   * Compute true airspeed from ground speed and wind.
   *
   * TAS vector = Ground velocity vector - Wind velocity vector
   * (Wind components represent air motion, so TAS = GS - wind)
   *
   * @param groundSpeed - Ground speed in m/s
   * @param track - Track angle in degrees (0=North, clockwise)
   * @param wind - Wind at aircraft altitude
   * @returns True airspeed in m/s and heading in degrees
   */
  computeTAS(
    groundSpeed: number,
    track: number,
    wind: Wind,
  ): { trueAirspeed: number; heading: number } {
    if (!Number.isFinite(groundSpeed) || groundSpeed < 0) {
      return { trueAirspeed: 0, heading: 0 };
    }

    const trackRad = (track * Math.PI) / 180;

    // Ground velocity in NED
    const gsN = groundSpeed * Math.cos(trackRad);
    const gsE = groundSpeed * Math.sin(trackRad);

    // TAS = GS - Wind (wind components are the air's velocity)
    // northComponent is positive when wind blows FROM south (i.e., air moves northward)
    const tasN = gsN - wind.northComponent;
    const tasE = gsE - wind.eastComponent;

    const trueAirspeed = Math.sqrt(tasN ** 2 + tasE ** 2);
    let heading = (Math.atan2(tasE, tasN) * 180) / Math.PI;
    if (heading < 0) heading += 360;

    return { trueAirspeed, heading };
  }
}
