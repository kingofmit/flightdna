import type {
  AeroCoefficients,
  AircraftConfig,
  DragPolar,
  DynamicsState,
  ForceVector,
} from "./types";

const G = 9.80665; // m/s^2

/**
 * Point-mass 3-DOF flight dynamics model.
 *
 * Computes aerodynamic forces, propagates the state using RK4
 * numerical integration, and estimates performance from observed
 * trajectory data. Attitude is treated as an input (not propagated).
 */
export class FlightDynamicsModel {
  private readonly config: AircraftConfig;

  constructor(config: AircraftConfig) {
    if (config.mass <= 0 || !Number.isFinite(config.mass)) {
      throw new Error(`Invalid aircraft mass: ${config.mass}. Must be positive and finite.`);
    }
    if (config.wingArea <= 0 || !Number.isFinite(config.wingArea)) {
      throw new Error(`Invalid wing area: ${config.wingArea}. Must be positive and finite.`);
    }
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
    if (airspeed <= 0 || density <= 0) {
      return { lift: 0, drag: 0, sideForce: 0 };
    }

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
    if (q <= 0) return 0;
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
    if (q <= 0) return 0;
    const weight = this.config.mass * G;
    return (weight * loadFactor * Math.cos(flightPathAngle)) /
      (q * this.config.wingArea);
  }

  /**
   * Transform a body-frame velocity vector to NED frame using the DCM
   * constructed from Euler angles (3-2-1 rotation sequence).
   */
  bodyToNED(
    velocity: [number, number, number],
    attitude: [number, number, number],
  ): [number, number, number] {
    const [u, v, w] = velocity;
    const [phi, theta, psi] = attitude;

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

    return [vN, vE, vD];
  }

  private computeDerivatives(
    _position: [number, number, number],
    velocity: [number, number, number],
    attitude: [number, number, number],
    forces: ForceVector,
    mass: number,
  ): { dPosition: [number, number, number]; dVelocity: [number, number, number] } {
    const [phi, theta] = attitude;

    const ax = forces.x / mass - G * Math.sin(theta);
    const ay = forces.y / mass + G * Math.cos(theta) * Math.sin(phi);
    const az = forces.z / mass + G * Math.cos(theta) * Math.cos(phi);

    const [vN, vE, vD] = this.bodyToNED(velocity, attitude);

    return {
      dPosition: [vN, vE, vD],
      dVelocity: [ax, ay, az],
    };
  }

  /**
   * Propagate the dynamics state forward by dt seconds using RK4 integration.
   *
   * @param state - Current state
   * @param forces - Applied forces in body frame
   * @param dt - Time step in seconds
   * @returns Updated state
   */
  propagate(
    state: DynamicsState,
    forces: ForceVector,
    dt: number,
  ): DynamicsState {
    const { position, velocity, attitude, mass } = state;

    type Vec3 = [number, number, number];
    const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const scale = (s: number, a: Vec3): Vec3 => [s * a[0], s * a[1], s * a[2]];

    const k1 = this.computeDerivatives(position, velocity, attitude, forces, mass);

    const k2 = this.computeDerivatives(
      add(position, scale(dt / 2, k1.dPosition)),
      add(velocity, scale(dt / 2, k1.dVelocity)),
      attitude, forces, mass,
    );

    const k3 = this.computeDerivatives(
      add(position, scale(dt / 2, k2.dPosition)),
      add(velocity, scale(dt / 2, k2.dVelocity)),
      attitude, forces, mass,
    );

    const k4 = this.computeDerivatives(
      add(position, scale(dt, k3.dPosition)),
      add(velocity, scale(dt, k3.dVelocity)),
      attitude, forces, mass,
    );

    const combine = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 => [
      (a[0] + 2 * b[0] + 2 * c[0] + d[0]) / 6,
      (a[1] + 2 * b[1] + 2 * c[1] + d[1]) / 6,
      (a[2] + 2 * b[2] + 2 * c[2] + d[2]) / 6,
    ];

    const dPos = combine(k1.dPosition, k2.dPosition, k3.dPosition, k4.dPosition);
    const dVel = combine(k1.dVelocity, k2.dVelocity, k3.dVelocity, k4.dVelocity);

    return {
      ...state,
      position: add(position, scale(dt, dPos)),
      velocity: add(velocity, scale(dt, dVel)),
      time: state.time + dt,
    };
  }

  /**
   * Compute drag coefficient with Mach-dependent wave drag correction.
   *
   * Below M_dd (drag divergence Mach), standard polar applies.
   * Above M_dd, wave drag rises per Lock's formula:
   *   CD_wave = 20 * (M - M_dd)^4
   *
   * @param cl - Lift coefficient
   * @param mach - Mach number
   * @param polar - Drag polar (subsonic)
   * @param mdd - Drag divergence Mach (default: 0.78 for typical transport)
   */
  computeDragCoefficientWithMach(
    cl: number,
    mach: number,
    polar: DragPolar,
    mdd: number = 0.78,
  ): number {
    // Subsonic drag polar
    let cd = polar.cd0 + polar.k * cl ** 2;

    // Wave drag above drag divergence Mach
    if (mach > mdd) {
      const deltaM = mach - mdd;
      cd += 20 * deltaM ** 4;
    }

    return cd;
  }

  /**
   * Compute total drag force with Mach correction.
   */
  computeDragWithMach(
    density: number,
    airspeed: number,
    cl: number,
    mach: number,
    polar: DragPolar,
    mdd: number = 0.78,
  ): number {
    const cd = this.computeDragCoefficientWithMach(cl, mach, polar, mdd);
    const q = 0.5 * density * airspeed ** 2;
    return q * this.config.wingArea * cd;
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
