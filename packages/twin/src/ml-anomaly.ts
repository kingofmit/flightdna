import type { FlightState } from "@flightdna/core";
import type { Anomaly, AnomalySeverity } from "./types";

export interface MLAnomalyConfig {
  /** Number of hidden units (default: 4) */
  hiddenSize?: number;
  /** Learning rate (default: 0.001) */
  learningRate?: number;
  /** Minimum training samples before detecting (default: 100) */
  minTrainingSamples?: number;
  /** Reconstruction error threshold multiplier (default: 3.0) */
  thresholdMultiplier?: number;
}

/**
 * ML-based anomaly detector using an online autoencoder.
 *
 * Learns a compressed representation of normal flight states
 * and flags states with high reconstruction error as anomalies.
 *
 * Features: [groundSpeed, altitude, verticalRate, track,
 *            acceleration, altitudeRate_change]
 * All features are normalized to zero-mean, unit-variance.
 */
export class MLAnomalyDetector {
  private readonly config: Required<MLAnomalyConfig>;
  private readonly inputSize = 6;
  private readonly hiddenSize: number;

  // Autoencoder weights
  private encoderWeights: number[][]; // inputSize x hiddenSize
  private encoderBias: number[]; // hiddenSize
  private decoderWeights: number[][]; // hiddenSize x inputSize
  private decoderBias: number[]; // inputSize

  // Online normalization (Welford's)
  private featureMean: number[];
  private featureM2: number[];
  private sampleCount = 0;

  // Reconstruction error statistics
  private errorMean = 0;
  private errorM2 = 0;
  private errorCount = 0;

  // Previous state for derived features
  private prevState: FlightState | null = null;
  private nextId = 1;

  constructor(config: MLAnomalyConfig = {}) {
    this.config = {
      hiddenSize: config.hiddenSize ?? 4,
      learningRate: config.learningRate ?? 0.001,
      minTrainingSamples: config.minTrainingSamples ?? 100,
      thresholdMultiplier: config.thresholdMultiplier ?? 3.0,
    };
    this.hiddenSize = this.config.hiddenSize;

    // Initialize weights with small random values (Xavier initialization)
    // Use deterministic seeded values for reproducibility
    this.encoderWeights = this.initWeights(this.inputSize, this.hiddenSize, 42);
    this.encoderBias = new Array<number>(this.hiddenSize).fill(0);
    this.decoderWeights = this.initWeights(
      this.hiddenSize,
      this.inputSize,
      137,
    );
    this.decoderBias = new Array<number>(this.inputSize).fill(0);

    this.featureMean = new Array<number>(this.inputSize).fill(0);
    this.featureM2 = new Array<number>(this.inputSize).fill(0);
  }

  /**
   * Process a flight state: train the autoencoder and detect anomalies.
   */
  analyze(state: FlightState): Anomaly | null {
    const features = this.extractFeatures(state);
    if (!features) {
      this.prevState = state;
      return null;
    }

    this.prevState = state;

    // Update feature normalization statistics
    this.updateNormalization(features);
    this.sampleCount++;

    // Normalize features
    const normalized = this.normalize(features);

    // Forward pass
    const hidden = this.encode(normalized);
    const reconstructed = this.decode(hidden);

    // Reconstruction error (MSE)
    let error = 0;
    for (let i = 0; i < this.inputSize; i++) {
      error += (normalized[i] - reconstructed[i]) ** 2;
    }
    error /= this.inputSize;

    // Update error statistics
    this.updateErrorStats(error);

    // Backward pass (train) — always train to adapt to flight patterns
    this.backpropagate(normalized, hidden, reconstructed);

    // Detect anomaly only after sufficient training
    if (this.sampleCount < this.config.minTrainingSamples) return null;

    const errorStd = this.getErrorStd();
    if (errorStd < 1e-10) return null;

    const zScore = (error - this.errorMean) / errorStd;

    if (zScore > this.config.thresholdMultiplier) {
      const severity: AnomalySeverity =
        zScore > 6 ? "critical" : zScore > 4 ? "warning" : "info";

      return {
        id: `ml-anomaly-${this.nextId++}`,
        type: "ml_reconstruction_error",
        message: `ML anomaly: reconstruction error ${zScore.toFixed(1)}\u03C3 above mean (error=${error.toFixed(4)})`,
        severity,
        deviation: zScore,
        detectedAt: Date.now(),
        triggerState: state,
      };
    }

    return null;
  }

  /**
   * Get current model statistics.
   */
  getStats(): {
    sampleCount: number;
    errorMean: number;
    errorStd: number;
    trained: boolean;
  } {
    return {
      sampleCount: this.sampleCount,
      errorMean: this.errorMean,
      errorStd: this.getErrorStd(),
      trained: this.sampleCount >= this.config.minTrainingSamples,
    };
  }

  reset(): void {
    this.sampleCount = 0;
    this.errorMean = 0;
    this.errorM2 = 0;
    this.errorCount = 0;
    this.featureMean.fill(0);
    this.featureM2.fill(0);
    this.prevState = null;
    this.nextId = 1;
    // Re-initialize weights
    this.encoderWeights = this.initWeights(this.inputSize, this.hiddenSize, 42);
    this.encoderBias.fill(0);
    this.decoderWeights = this.initWeights(
      this.hiddenSize,
      this.inputSize,
      137,
    );
    this.decoderBias.fill(0);
  }

  // --- Feature extraction ---

  private extractFeatures(state: FlightState): number[] | null {
    if (!this.prevState) return null;

    const dt = (state.timestamp - this.prevState.timestamp) / 1000;
    if (dt <= 0 || dt > 60) return null;

    const acceleration =
      (state.velocity.groundSpeed - this.prevState.velocity.groundSpeed) / dt;
    const vrChange =
      (state.velocity.verticalRate - this.prevState.velocity.verticalRate) / dt;

    return [
      state.velocity.groundSpeed,
      state.position.altitude,
      state.velocity.verticalRate,
      state.velocity.track,
      acceleration,
      vrChange,
    ];
  }

  // --- Normalization ---

  private updateNormalization(features: number[]): void {
    const n = this.sampleCount + 1;
    for (let i = 0; i < this.inputSize; i++) {
      const delta = features[i] - this.featureMean[i];
      this.featureMean[i] += delta / n;
      this.featureM2[i] += delta * (features[i] - this.featureMean[i]);
    }
  }

  private normalize(features: number[]): number[] {
    return features.map((f, i) => {
      const std =
        this.sampleCount > 1
          ? Math.sqrt(this.featureM2[i] / (this.sampleCount - 1))
          : 1;
      return std > 1e-10 ? (f - this.featureMean[i]) / std : 0;
    });
  }

  // --- Autoencoder ---

  private encode(input: number[]): number[] {
    const hidden = new Array<number>(this.hiddenSize);
    for (let j = 0; j < this.hiddenSize; j++) {
      let sum = this.encoderBias[j];
      for (let i = 0; i < this.inputSize; i++) {
        sum += input[i] * this.encoderWeights[i][j];
      }
      hidden[j] = Math.tanh(sum); // tanh activation
    }
    return hidden;
  }

  private decode(hidden: number[]): number[] {
    const output = new Array<number>(this.inputSize);
    for (let i = 0; i < this.inputSize; i++) {
      let sum = this.decoderBias[i];
      for (let j = 0; j < this.hiddenSize; j++) {
        sum += hidden[j] * this.decoderWeights[j][i];
      }
      output[i] = sum; // linear output
    }
    return output;
  }

  private backpropagate(
    input: number[],
    hidden: number[],
    output: number[],
  ): void {
    const lr = this.config.learningRate;

    // Output error: dL/do = 2*(output - input) / inputSize
    const outputError = new Array<number>(this.inputSize);
    for (let i = 0; i < this.inputSize; i++) {
      outputError[i] = (2 * (output[i] - input[i])) / this.inputSize;
    }

    // Decoder weight gradients
    for (let j = 0; j < this.hiddenSize; j++) {
      for (let i = 0; i < this.inputSize; i++) {
        this.decoderWeights[j][i] -= lr * hidden[j] * outputError[i];
      }
    }
    for (let i = 0; i < this.inputSize; i++) {
      this.decoderBias[i] -= lr * outputError[i];
    }

    // Hidden error (backprop through decoder)
    const hiddenError = new Array<number>(this.hiddenSize).fill(0);
    for (let j = 0; j < this.hiddenSize; j++) {
      for (let i = 0; i < this.inputSize; i++) {
        hiddenError[j] += outputError[i] * this.decoderWeights[j][i];
      }
      // tanh derivative: 1 - tanh^2
      hiddenError[j] *= 1 - hidden[j] * hidden[j];
    }

    // Encoder weight gradients
    for (let i = 0; i < this.inputSize; i++) {
      for (let j = 0; j < this.hiddenSize; j++) {
        this.encoderWeights[i][j] -= lr * input[i] * hiddenError[j];
      }
    }
    for (let j = 0; j < this.hiddenSize; j++) {
      this.encoderBias[j] -= lr * hiddenError[j];
    }
  }

  // --- Error statistics ---

  private updateErrorStats(error: number): void {
    this.errorCount++;
    const delta = error - this.errorMean;
    this.errorMean += delta / this.errorCount;
    this.errorM2 += delta * (error - this.errorMean);
  }

  private getErrorStd(): number {
    if (this.errorCount < 2) return 0;
    return Math.sqrt(this.errorM2 / (this.errorCount - 1));
  }

  // --- Weight initialization ---

  private initWeights(rows: number, cols: number, seed: number): number[][] {
    // Xavier initialization with deterministic PRNG
    const scale = Math.sqrt(2 / (rows + cols));
    let state = seed;
    const rand = (): number => {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      return ((state >>> 0) / 0xffffffff - 0.5) * 2;
    };

    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => rand() * scale),
    );
  }
}
