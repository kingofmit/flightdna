/**
 * Aerodynamic coefficients for the current flight condition.
 */
export interface AeroCoefficients {
  /** Lift coefficient */
  cl: number;
  /** Drag coefficient */
  cd: number;
  /** Side force coefficient */
  cy?: number;
  /** Pitching moment coefficient */
  cm?: number;
  /** Rolling moment coefficient */
  croll?: number;
  /** Yawing moment coefficient */
  cn?: number;
}

/**
 * Drag polar model: CD = CD0 + k * CL^2
 */
export interface DragPolar {
  /** Zero-lift drag coefficient (parasite drag) */
  cd0: number;
  /** Induced drag factor (1 / (pi * e * AR)) */
  k: number;
  /** Oswald efficiency factor */
  oswald: number;
  /** Aspect ratio of the wing */
  aspectRatio: number;
  /** Mach number at which this polar was estimated */
  mach?: number;
  /** R-squared goodness of fit (0-1) */
  rSquared?: number;
}

/**
 * Observation point for drag polar estimation.
 */
export interface DragPolarObservation {
  /** Lift coefficient */
  cl: number;
  /** Drag coefficient */
  cd: number;
  /** Mach number */
  mach: number;
  /** Weight in Newtons, if known */
  weight?: number;
}

/**
 * Performance metrics for a flight condition.
 */
export interface PerformanceMetrics {
  /** Mach number */
  mach: number;
  /** True airspeed in m/s */
  trueAirspeed: number;
  /** Lift-to-drag ratio */
  liftToDrag: number;
  /** Rate of climb in m/s (negative = descent) */
  rateOfClimb: number;
  /** Estimated specific fuel consumption in kg/(N*s) */
  specificFuelConsumption?: number;
  /** Estimated fuel flow in kg/s */
  fuelFlow?: number;
  /** Specific range in m/kg (distance per unit fuel) */
  specificRange?: number;
  /** Estimated range in meters at current conditions */
  range?: number;
  /** Estimated endurance in seconds */
  endurance?: number;
  /** Specific excess power (Ps) in m/s */
  specificExcessPower: number;
  /** Load factor (n = L/W) */
  loadFactor: number;
}

/**
 * Force vector in the body or wind axis system (Newtons).
 */
export interface ForceVector {
  /** X-axis force (forward positive) */
  x: number;
  /** Y-axis force (right positive) */
  y: number;
  /** Z-axis force (down positive) */
  z: number;
}

/**
 * Moment vector in the body axis system (Newton-meters).
 */
export interface MomentVector {
  /** Rolling moment (about x-axis) */
  roll: number;
  /** Pitching moment (about y-axis) */
  pitch: number;
  /** Yawing moment (about z-axis) */
  yaw: number;
}

/**
 * 6-DOF dynamics state vector.
 */
export interface DynamicsState {
  /** Position: [x, y, z] in meters (NED frame) */
  position: [number, number, number];
  /** Velocity: [u, v, w] in m/s (body frame) */
  velocity: [number, number, number];
  /** Euler angles: [phi, theta, psi] in radians */
  attitude: [number, number, number];
  /** Angular rates: [p, q, r] in rad/s (body frame) */
  angularRate: [number, number, number];
  /** Mass in kg */
  mass: number;
  /** Timestamp in seconds */
  time: number;
}

/**
 * Aircraft configuration for dynamics modeling.
 */
export interface AircraftConfig {
  /** Aircraft mass in kg */
  mass: number;
  /** Wing reference area in m^2 */
  wingArea: number;
  /** Wing span in meters */
  wingSpan?: number;
  /** Mean aerodynamic chord in meters */
  mac?: number;
  /** Maximum thrust in Newtons */
  maxThrust?: number;
  /** Number of engines */
  engineCount?: number;
}
