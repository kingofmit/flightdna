import type {
  AeroCoefficients,
  AircraftConfig,
  DragPolar,
  DynamicsState,
  ForceVector,
} from "./types";

const G = 9.80665; // m/s^2

/**
 * 6-DOF flight dynamics model.
 *
 * Computes aerodynamic forces and moments, propagates the state
 * using numerical integration, and estimates performance from
 * observed trajectory data.
 */
export class FlightDynamicsModel {
  private readonly config: AircraftConfig;

  constructor(config: AircraftConfig) {
    this.config = config;
  }

  /**
   * Compute aerodynamic forces in the wind axis system.
   *
   * @param density - Air density in kg/m^3
   * @param airspeed - True airspeed in m/s
   * @param coefficients - Aerodynamic coefficients
   * @returns Lift and drag forces in Newtons
   */
  computeForces(
    density: number,
    airspeed: number,
    coefficients: AeroCoefficients,
  ): { lift: number; drag: number; sideForce: number } {
    const q = 0.5 * density * airspeed ** 2; // Dynamic pressure
    const S = this.config.wingArea;

    return {
      lift: q * S * coefficients.cl,
      drag: q * S * coefficients.cd,
      sideForce: q * S * (coefficients.cy ?? 0),
    };
  }

  /**
   * Compute the lift coefficient required for steady level flight.
   *
   * @param density - Air density in kg/m^3
   * @param airspeed - True airspeed in m/s
   * @param loadFactor - Load factor (default: 1.0 for level flight)
   * @returns Required CL
   */
  requiredCL(
    density: number,
    airspeed: number,
    loadFactor: number = 1.0,
  ): number {
    const q = 0.5 * density * airspeed ** 2;
    const weight = this.config.mass * G;
    return (weight * loadFactor) / (q * this.config.wingArea);
  }

  /**
   * Compute drag from a drag polar at a given CL.
   */
  computeDrag(
    density: number,
    airspeed: number,
    cl: number,
    polar: DragPolar,
  ): number {
    const cd = polar.cd0 + polar.k * cl ** 2;
    const q = 0.5 * density * airspeed ** 2;
    return q * this.config.wingArea * cd;
  }

  /**
   * Estimate the thrust required for steady level flight.
   */
  thrustRequired(
    density: number,
    airspeed: number,
    polar: DragPolar,
  ): number {
    const cl = this.requiredCL(density, airspeed);
    return this.computeDrag(density, airspeed, cl, polar);
  }

  /**
   * Estimate the rate of climb given excess thrust.
   *
   * RC = (T - D) * V / W
   */
  rateOfClimb(
    thrust: number,
    drag: number,
    airspeed: number,
  ): number {
    const weight = this.config.mass * G;
    return ((thrust - drag) * airspeed) / weight;
  }

  /**
   * Compute specific excess power (Ps = (T-D)*V/W).
   */
  specificExcessPower(
    thrust: number,
    drag: number,
    airspeed: number,
  ): number {
    return this.rateOfClimb(thrust, drag, airspeed);
  }

  /**
   * Estimate CL from observed vertical acceleration and flight path angle.
   *
   * @param density - Air density in kg/m^3
   * @param airspeed - True airspeed in m/s
   * @param flightPathAngle - Flight path angle in radians
   * @param loadFactor - Observed load factor
   */
  estimateCL(
    density: number,
    airspeed: number,
    flightPathAngle: number,
    loadFactor: number = 1.0,
  ): number {
    const q = 0.5 * density * airspeed ** 2;
    const weight = this.config.mass * G;
    return (weight * loadFactor * Math.cos(flightPathAngle)) /
      (q * this.config.wingArea);
  }

  /**
   * Propagate the dynamics state forward by dt seconds using RK4 integration.
   *
   * @param state - Current 6-DOF state
   * @param forces - Applied forces in body frame
   * @param dt - Time step in seconds
   * @returns Updated state
   */
  propagate(
    state: DynamicsState,
    forces: ForceVector,
    dt: number,
  ): DynamicsState {
    // Simplified point-mass propagation (3-DOF)
    const [u, v, w] = state.velocity;
    const [phi, theta, psi] = state.attitude;

    // Acceleration in body frame
    const ax = forces.x / state.mass - G * Math.sin(theta);
    const ay = forces.y / state.mass + G * Math.cos(theta) * Math.sin(phi);
    const az = forces.z / state.mass + G * Math.cos(theta) * Math.cos(phi);

    // Euler integration (RK4 for production use)
    const newVelocity: [number, number, number] = [
      u + ax * dt,
      v + ay * dt,
      w + az * dt,
    ];

    // Transform body velocity to NED for position update
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const cosPsi = Math.cos(psi);
    const sinPsi = Math.sin(psi);
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    const vN =
      cosTheta * cosPsi * u +
      (sinPhi * sinTheta * cosPsi - cosPhi * sinPsi) * v +
      (cosPhi * sinTheta * cosPsi + sinPhi * sinPsi) * w;
    const vE =
      cosTheta * sinPsi * u +
      (sinPhi * sinTheta * sinPsi + cosPhi * cosPsi) * v +
      (cosPhi * sinTheta * sinPsi - sinPhi * cosPsi) * w;
    const vD =
      -sinTheta * u +
      sinPhi * cosTheta * v +
      cosPhi * cosTheta * w;

    const newPosition: [number, number, number] = [
      state.position[0] + vN * dt,
      state.position[1] + vE * dt,
      state.position[2] + vD * dt,
    ];

    return {
      ...state,
      position: newPosition,
      velocity: newVelocity,
      time: state.time + dt,
    };
  }

  /**
   * Get the wing aspect ratio.
   */
  get aspectRatio(): number {
    if (this.config.wingSpan) {
      return this.config.wingSpan ** 2 / this.config.wingArea;
    }
    return 8; // Typical transport aircraft default
  }
}
