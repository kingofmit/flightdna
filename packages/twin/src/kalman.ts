import type { KalmanConfig, KalmanState } from "./types";

const N = 8; // state dimension
const M = 6; // measurement dimension

/**
 * Extended Kalman Filter with coordinated-turn motion model.
 *
 * State vector: [lat, lon, alt, vN, vE, vD, heading, turnRate]
 * Measurement:  [lat, lon, alt, vN, vE, vD]
 */
export class KalmanFilter {
  private state: KalmanState;
  private readonly config: KalmanConfig;
  private initialized = false;
  private _lastUpdateFailed = false;
  private adaptiveFactor = 1.0;
  private innovationWindow: number[][] = [];
  private readonly innovationWindowSize = 10;

  constructor(config: Partial<KalmanConfig> = {}) {
    this.config = {
      processNoise: config.processNoise ?? 1.0,
      positionNoise: config.positionNoise ?? 50,
      velocityNoise: config.velocityNoise ?? 5,
      adaptiveNoise: config.adaptiveNoise ?? false,
    };

    this.state = {
      x: new Array(N).fill(0),
      P: this.identity(N, 1000),
      timestamp: 0,
    };
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  get lastUpdateFailed(): boolean {
    return this._lastUpdateFailed;
  }

  getState(): KalmanState {
    return {
      ...this.state,
      x: [...this.state.x],
      P: this.state.P.map((r) => [...r]),
    };
  }

  /**
   * Predict step using nonlinear coordinated-turn model.
   */
  predict(timestamp: number): void {
    if (!this.initialized) return;

    const dt = (timestamp - this.state.timestamp) / 1000;
    if (dt <= 0) return;

    const x = this.state.x;
    const xNew = this.propagate(x, dt);
    const F = this.jacobian(x, dt);

    this.state.x = xNew;

    const Q = this.processNoise(dt);

    // P = F * P * F^T + Q
    const FP = this.matMul(F, this.state.P);
    const FT = this.transpose(F);
    const FPFT = this.matMul(FP, FT);
    this.state.P = this.matAdd(FPFT, Q);
    this.state.timestamp = timestamp;
  }

  /**
   * Update step with Joseph-form covariance and optional adaptive noise.
   */
  update(measurement: number[], timestamp: number): void {
    if (!this.initialized) {
      this.state.x = [...measurement, 0, 0]; // append heading=0, turnRate=0
      if (measurement.length >= 5) {
        // Derive initial heading from velocity
        const vN = measurement[3];
        const vE = measurement[4];
        this.state.x[6] = Math.atan2(vE, vN);
      }
      this.state.timestamp = timestamp;
      this.initialized = true;
      return;
    }

    this.predict(timestamp);

    // H is M x N: identity for first 6 states, zeros for heading/turnRate
    const H = this.makeH();

    const R = this.measurementNoise();

    // Innovation: y = z - H * x
    const Hx = this.matVecMul(H, this.state.x);
    const y = measurement.map((m, i) => m - Hx[i]);

    // Adaptive noise estimation
    if (this.config.adaptiveNoise) {
      this.updateAdaptiveFactor(y, H, R);
    }

    // Apply adaptive factor to process noise retroactively via P scaling
    // (already baked into Q during predict; for IAE we scale R inversely or
    // accept the predict-phase adaptation on next cycle)

    // Innovation covariance: S = H * P * H^T + R
    const HP = this.matMulRect(H, this.state.P, M, N, N);
    const HT = this.transposeRect(H, M, N);
    const HPHT = this.matMulRect(HP, HT, M, N, M);
    const S = this.matAddSized(HPHT, R, M);

    // Kalman gain: K = P * H^T * S^{-1}
    const PHT = this.matMulRect(this.state.P, HT, N, N, M);
    const SInv = this.invert(S, M);
    if (!SInv) {
      this._lastUpdateFailed = true;
      // Re-initialize filter with current measurement to recover
      this.state.x = [...measurement, this.state.x[6], this.state.x[7]];
      this.state.P = this.identity(N, 1000);
      this.state.timestamp = timestamp;
      return;
    }
    this._lastUpdateFailed = false;
    const K = this.matMulRect(PHT, SInv, N, M, M);

    // State update: x = x + K * y
    const Ky = this.matVecMulRect(K, y, N, M);
    this.state.x = this.state.x.map((xi, i) => xi + Ky[i]);

    // Normalize heading to [-pi, pi]
    this.state.x[6] = this.normalizeAngle(this.state.x[6]);

    // Joseph-form covariance update: P = (I-KH)*P*(I-KH)^T + K*R*K^T
    const KH = this.matMulRect(K, H, N, M, N);
    const I = this.identity(N, 1);
    const IKH = this.matSub(I, KH);
    const IKHP = this.matMul(IKH, this.state.P);
    const IKHT = this.transpose(IKH);
    const joseph1 = this.matMul(IKHP, IKHT);
    const KR = this.matMulRect(K, R, N, M, M);
    const KT = this.transposeRect(K, N, M);
    const joseph2 = this.matMulRect(KR, KT, N, M, N);
    this.state.P = this.matAdd(joseph1, joseph2);

    this.state.timestamp = timestamp;
  }

  // --- Nonlinear motion model ---

  private propagate(x: number[], dt: number): number[] {
    const [lat, lon, alt, vN, vE, vD, heading, omega] = x;
    const latRad = (lat * Math.PI) / 180;
    const cosLat = Math.cos(latRad);
    const invLatScale = 1 / 111320;
    const invLonScale = cosLat > 1e-10 ? 1 / (111320 * cosLat) : 0;

    const xNew = new Array(N);

    if (Math.abs(omega) < 0.001) {
      // Straight flight
      xNew[0] = lat + vN * dt * invLatScale;
      xNew[1] = lon + vE * dt * invLonScale;
      xNew[2] = alt - vD * dt;
      xNew[3] = vN;
      xNew[4] = vE;
      xNew[5] = vD;
      xNew[6] = heading + omega * dt;
      xNew[7] = omega;
    } else {
      // Coordinated turn
      const speed = Math.sqrt(vN * vN + vE * vE);
      const headingNew = heading + omega * dt;
      const vNNew = speed * Math.cos(headingNew);
      const vENew = speed * Math.sin(headingNew);

      xNew[0] = lat + ((vN + vNNew) / 2) * dt * invLatScale;
      xNew[1] = lon + ((vE + vENew) / 2) * dt * invLonScale;
      xNew[2] = alt - vD * dt;
      xNew[3] = vNNew;
      xNew[4] = vENew;
      xNew[5] = vD;
      xNew[6] = headingNew;
      xNew[7] = omega;
    }

    xNew[6] = this.normalizeAngle(xNew[6]);
    return xNew;
  }

  private jacobian(x: number[], dt: number): number[][] {
    const [lat, _lon, _alt, vN, vE, _vD, heading, omega] = x;
    const latRad = (lat * Math.PI) / 180;
    const cosLat = Math.cos(latRad);
    const invLatScale = 1 / 111320;
    const invLonScale = cosLat > 1e-10 ? 1 / (111320 * cosLat) : 0;

    const F = this.identity(N, 1);

    if (Math.abs(omega) < 0.001) {
      // Straight-flight Jacobian
      F[0][3] = dt * invLatScale; // dlat/dvN
      F[1][4] = dt * invLonScale; // dlon/dvE
      F[2][5] = -dt;              // dalt/dvD
      F[6][7] = dt;               // dheading/domega
    } else {
      const speed = Math.sqrt(vN * vN + vE * vE);
      const headingNew = heading + omega * dt;
      const cosH = Math.cos(headingNew);
      const sinH = Math.sin(headingNew);
      // cosH0/sinH0 reserved for future full Jacobian terms
      const _cosH0 = Math.cos(heading);
      const _sinH0 = Math.sin(heading);

      // Derivatives of vN_new, vE_new w.r.t. state
      // vN_new = speed * cos(heading + omega*dt)
      // vE_new = speed * sin(heading + omega*dt)
      const dSpeed_dvN = speed > 1e-10 ? vN / speed : 0;
      const dSpeed_dvE = speed > 1e-10 ? vE / speed : 0;

      // lat = lat0 + (vN + vN_new)/2 * dt * invLatScale
      // dlat/dvN
      F[0][3] = (0.5 * dt * invLatScale) * (1 + dSpeed_dvN * cosH);
      // dlatdvE
      F[0][4] = (0.5 * dt * invLatScale) * (dSpeed_dvE * cosH);
      // dlatdheading
      F[0][6] = (0.5 * dt * invLatScale) * (-speed * sinH);
      // dlatdomega
      F[0][7] = (0.5 * dt * dt * invLatScale) * (-speed * sinH);

      // lon = lon0 + (vE + vE_new)/2 * dt * invLonScale
      F[1][3] = (0.5 * dt * invLonScale) * (dSpeed_dvN * sinH);
      F[1][4] = (0.5 * dt * invLonScale) * (1 + dSpeed_dvE * sinH);
      F[1][6] = (0.5 * dt * invLonScale) * (speed * cosH);
      F[1][7] = (0.5 * dt * dt * invLonScale) * (speed * cosH);

      // alt
      F[2][5] = -dt;

      // vN_new = speed * cos(headingNew)
      F[3][3] = dSpeed_dvN * cosH;
      F[3][4] = dSpeed_dvE * cosH;
      F[3][6] = -speed * sinH;
      F[3][7] = -speed * sinH * dt;

      // vE_new = speed * sin(headingNew)
      F[4][3] = dSpeed_dvN * sinH;
      F[4][4] = dSpeed_dvE * sinH;
      F[4][6] = speed * cosH;
      F[4][7] = speed * cosH * dt;

      // vD unchanged
      // heading_new = heading + omega*dt
      F[6][6] = 1;
      F[6][7] = dt;
      // omega unchanged (identity)
    }

    return F;
  }

  private processNoise(dt: number): number[][] {
    const q = this.config.processNoise * this.adaptiveFactor;
    const Q = this.zeros(N);
    const dt2 = dt * dt;
    const dt3 = dt * dt * dt;

    // Position-velocity coupling
    for (let i = 0; i < 3; i++) {
      Q[i][i] = (dt3 / 3) * q;
      Q[i][i + 3] = (dt2 / 2) * q;
      Q[i + 3][i] = (dt2 / 2) * q;
      Q[i + 3][i + 3] = dt * q;
    }

    // Heading noise
    Q[6][6] = dt * q * 0.01;
    // Turn rate noise
    Q[7][7] = dt * q * 0.001;

    return Q;
  }

  private measurementNoise(): number[][] {
    const R = this.zeros(M);
    const pn = this.config.positionNoise;
    const vn = this.config.velocityNoise;
    R[0][0] = pn * pn;         // lat noise
    R[1][1] = pn * pn;         // lon noise
    R[2][2] = (pn * 0.3) ** 2; // altitude noise (barometric is more precise)
    R[3][3] = vn * vn;
    R[4][4] = vn * vn;
    R[5][5] = (vn * 1.5) ** 2; // vertical rate noise is higher
    return R;
  }

  private makeH(): number[][] {
    // 6x8 matrix: identity for first 6 cols, zeros for last 2
    return Array.from({ length: M }, (_, i) =>
      Array.from({ length: N }, (_, j) => (i === j ? 1 : 0)),
    );
  }

  // --- Adaptive noise estimation ---

  private updateAdaptiveFactor(y: number[], H: number[][], R: number[][]): void {
    this.innovationWindow.push([...y]);
    if (this.innovationWindow.length > this.innovationWindowSize) {
      this.innovationWindow.shift();
    }

    if (this.innovationWindow.length < this.innovationWindowSize) return;

    // Empirical innovation covariance
    const Cy = this.zeros(M);
    for (const yi of this.innovationWindow) {
      for (let r = 0; r < M; r++) {
        for (let c = 0; c < M; c++) {
          Cy[r][c] += yi[r] * yi[c];
        }
      }
    }
    const invN = 1 / this.innovationWindow.length;
    for (let r = 0; r < M; r++) {
      for (let c = 0; c < M; c++) {
        Cy[r][c] *= invN;
      }
    }

    // Expected innovation covariance S = H*P*H^T + R
    const HP = this.matMulRect(H, this.state.P, M, N, N);
    const HT = this.transposeRect(H, M, N);
    const HPHT = this.matMulRect(HP, HT, M, N, M);
    const S = this.matAddSized(HPHT, R, M);

    const traceCy = this.trace(Cy, M);
    const traceS = this.trace(S, M);

    if (traceS > 0) {
      if (traceCy > 2 * traceS) {
        this.adaptiveFactor = Math.min(10.0, this.adaptiveFactor * 2);
      } else if (traceCy < 0.5 * traceS) {
        this.adaptiveFactor = Math.max(0.1, this.adaptiveFactor * 0.5);
      }
    }
  }

  private trace(A: number[][], n: number): number {
    let t = 0;
    for (let i = 0; i < n; i++) t += A[i][i];
    return t;
  }

  private normalizeAngle(a: number): number {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  // --- Matrix utilities ---

  private identity(n: number, scale: number): number[][] {
    return Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? scale : 0)),
    );
  }

  private zeros(n: number): number[][] {
    return Array.from({ length: n }, () => new Array(n).fill(0) as number[]);
  }

  private matVecMul(A: number[][], x: number[]): number[] {
    return A.map((row) => row.reduce((sum, a, j) => sum + a * x[j], 0));
  }

  private matVecMulRect(A: number[][], x: number[], rows: number, cols: number): number[] {
    const result = new Array(rows).fill(0);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        result[i] += A[i][j] * x[j];
      }
    }
    return result;
  }

  private matMul(A: number[][], B: number[][]): number[][] {
    const n = A.length;
    const C = this.zeros(n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          C[i][j] += A[i][k] * B[k][j];
        }
      }
    }
    return C;
  }

  private matMulRect(A: number[][], B: number[][], aRows: number, aCols: number, bCols: number): number[][] {
    const C = Array.from({ length: aRows }, () => new Array(bCols).fill(0) as number[]);
    for (let i = 0; i < aRows; i++) {
      for (let j = 0; j < bCols; j++) {
        for (let k = 0; k < aCols; k++) {
          C[i][j] += A[i][k] * B[k][j];
        }
      }
    }
    return C;
  }

  private matAdd(A: number[][], B: number[][]): number[][] {
    return A.map((row, i) => row.map((a, j) => a + B[i][j]));
  }

  private matAddSized(A: number[][], B: number[][], n: number): number[][] {
    return Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => A[i][j] + B[i][j]),
    );
  }

  private matSub(A: number[][], B: number[][]): number[][] {
    return A.map((row, i) => row.map((a, j) => a - B[i][j]));
  }

  private transpose(A: number[][]): number[][] {
    return A[0].map((_, j) => A.map((row) => row[j]));
  }

  private transposeRect(A: number[][], rows: number, cols: number): number[][] {
    return Array.from({ length: cols }, (_, j) =>
      Array.from({ length: rows }, (_, i) => A[i][j]),
    );
  }

  private invert(M: number[][], n: number): number[][] | null {
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
