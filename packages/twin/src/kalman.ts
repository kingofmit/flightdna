import type { KalmanConfig, KalmanState } from "./types";

/**
 * Linear Kalman filter for aircraft state estimation.
 *
 * Fuses ADS-B position/velocity measurements with a constant-velocity
 * motion model to produce smoothed state estimates.
 *
 * State vector: [lat, lon, alt, vN, vE, vD]
 */
export class KalmanFilter {
  private state: KalmanState;
  private readonly config: KalmanConfig;
  private initialized = false;

  constructor(config: Partial<KalmanConfig> = {}) {
    this.config = {
      processNoise: config.processNoise ?? 1.0,
      positionNoise: config.positionNoise ?? 50, // meters
      velocityNoise: config.velocityNoise ?? 5, // m/s
    };

    this.state = {
      x: [0, 0, 0, 0, 0, 0],
      P: this.identity(6, 1000),
      timestamp: 0,
    };
  }

  /**
   * Whether the filter has been initialized with a measurement.
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the current state estimate.
   */
  getState(): KalmanState {
    return { ...this.state, x: [...this.state.x], P: this.state.P.map((r) => [...r]) };
  }

  /**
   * Predict step: propagate the state forward in time.
   *
   * @param timestamp - Current timestamp in milliseconds
   */
  predict(timestamp: number): void {
    if (!this.initialized) return;

    const dt = (timestamp - this.state.timestamp) / 1000; // seconds
    if (dt <= 0) return;

    // State transition matrix (constant velocity model)
    // x_new = F * x
    const F = this.identity(6, 1);
    F[0][3] = dt; // lat += vN * dt (approximate, in degrees)
    F[1][4] = dt; // lon += vE * dt
    F[2][5] = dt; // alt += vD * dt

    // Predict state
    this.state.x = this.matVecMul(F, this.state.x);

    // Process noise
    const q = this.config.processNoise;
    const Q = this.zeros(6);
    const dt2 = dt ** 2;
    const dt3 = dt ** 3;
    // Position noise from acceleration uncertainty
    Q[0][0] = (dt3 / 3) * q;
    Q[1][1] = (dt3 / 3) * q;
    Q[2][2] = (dt3 / 3) * q;
    Q[0][3] = (dt2 / 2) * q;
    Q[1][4] = (dt2 / 2) * q;
    Q[2][5] = (dt2 / 2) * q;
    Q[3][0] = (dt2 / 2) * q;
    Q[4][1] = (dt2 / 2) * q;
    Q[5][2] = (dt2 / 2) * q;
    Q[3][3] = dt * q;
    Q[4][4] = dt * q;
    Q[5][5] = dt * q;

    // P = F * P * F^T + Q
    const FP = this.matMul(F, this.state.P);
    const FT = this.transpose(F);
    const FPFT = this.matMul(FP, FT);
    this.state.P = this.matAdd(FPFT, Q);
    this.state.timestamp = timestamp;
  }

  /**
   * Update step: incorporate a measurement.
   *
   * @param measurement - [lat, lon, alt, vN, vE, vD] measurement
   * @param timestamp - Measurement timestamp in milliseconds
   */
  update(measurement: number[], timestamp: number): void {
    if (!this.initialized) {
      // Initialize with first measurement
      this.state.x = [...measurement];
      this.state.timestamp = timestamp;
      this.initialized = true;
      return;
    }

    // Predict to measurement time
    this.predict(timestamp);

    // Measurement matrix (observe all states directly)
    const H = this.identity(6, 1);

    // Measurement noise
    const R = this.zeros(6);
    const pn = this.config.positionNoise;
    const vn = this.config.velocityNoise;
    R[0][0] = pn ** 2;
    R[1][1] = pn ** 2;
    R[2][2] = pn ** 2;
    R[3][3] = vn ** 2;
    R[4][4] = vn ** 2;
    R[5][5] = vn ** 2;

    // Innovation: y = z - H * x
    const Hx = this.matVecMul(H, this.state.x);
    const y = measurement.map((m, i) => m - Hx[i]);

    // Innovation covariance: S = H * P * H^T + R
    const HP = this.matMul(H, this.state.P);
    const HT = this.transpose(H);
    const HPHT = this.matMul(HP, HT);
    const S = this.matAdd(HPHT, R);

    // Kalman gain: K = P * H^T * S^{-1}
    const PHT = this.matMul(this.state.P, HT);
    const SInv = this.invert(S);
    if (!SInv) return; // Singular matrix — skip update
    const K = this.matMul(PHT, SInv);

    // State update: x = x + K * y
    const Ky = this.matVecMul(K, y);
    this.state.x = this.state.x.map((xi, i) => xi + Ky[i]);

    // Covariance update: P = (I - K*H) * P
    const KH = this.matMul(K, H);
    const I = this.identity(6, 1);
    const IKH = this.matSub(I, KH);
    this.state.P = this.matMul(IKH, this.state.P);
    this.state.timestamp = timestamp;
  }

  // --- Matrix utility methods ---

  private identity(n: number, scale: number): number[][] {
    return Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? scale : 0)),
    );
  }

  private zeros(n: number): number[][] {
    return Array.from({ length: n }, () => Array(n).fill(0) as number[]);
  }

  private matVecMul(A: number[][], x: number[]): number[] {
    return A.map((row) => row.reduce((sum, a, j) => sum + a * x[j], 0));
  }

  private matMul(A: number[][], B: number[][]): number[][] {
    const n = A.length;
    const m = B[0].length;
    const p = B.length;
    const C = this.zeros(n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        for (let k = 0; k < p; k++) {
          C[i][j] += A[i][k] * B[k][j];
        }
      }
    }
    return C;
  }

  private matAdd(A: number[][], B: number[][]): number[][] {
    return A.map((row, i) => row.map((a, j) => a + B[i][j]));
  }

  private matSub(A: number[][], B: number[][]): number[][] {
    return A.map((row, i) => row.map((a, j) => a - B[i][j]));
  }

  private transpose(A: number[][]): number[][] {
    return A[0].map((_, j) => A.map((row) => row[j]));
  }

  /**
   * Matrix inversion using Gauss-Jordan elimination.
   * Returns null if the matrix is singular.
   */
  private invert(M: number[][]): number[][] | null {
    const n = M.length;
    const aug = M.map((row, i) => [
      ...row,
      ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
    ]);

    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
          maxRow = k;
        }
      }
      [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

      if (Math.abs(aug[i][i]) < 1e-12) return null;

      const pivot = aug[i][i];
      for (let j = 0; j < 2 * n; j++) {
        aug[i][j] /= pivot;
      }

      for (let k = 0; k < n; k++) {
        if (k === i) continue;
        const factor = aug[k][i];
        for (let j = 0; j < 2 * n; j++) {
          aug[k][j] -= factor * aug[i][j];
        }
      }
    }

    return aug.map((row) => row.slice(n));
  }
}
