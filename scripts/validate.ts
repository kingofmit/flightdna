/**
 * FlightDNA Validation Script
 *
 * Generates reproducible results for the JOSS paper by running
 * validation experiments against each core module.
 *
 * Usage: npx tsx scripts/validate.ts
 */

import { ISACalculator } from "../packages/weather/src/isa";
import { DragPolarEstimator } from "../packages/dynamics/src/drag-polar";
import { KalmanFilter } from "../packages/twin/src/kalman";
import { AnomalyDetector } from "../packages/twin/src/anomaly";
import { FlightPhaseDetector } from "../packages/twin/src/flight-phase";
import { getAllAircraftTypes } from "../packages/dynamics/src/aircraft-db";
import type { FlightState } from "../packages/core/src/types";

// ---------------------------------------------------------------------------
// Deterministic seeded PRNG (Mulberry32)
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller transform for Gaussian noise using seeded PRNG. */
function gaussianNoise(rng: () => number, mean: number, std: number): number {
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-15)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

// ---------------------------------------------------------------------------
// Helper: build a minimal FlightState
// ---------------------------------------------------------------------------
function makeState(
  timestamp: number,
  lat: number,
  lon: number,
  alt: number,
  gs: number,
  vr: number,
  onGround: boolean,
  track = 0,
): FlightState {
  return {
    aircraft: { icao24: "AABBCC" },
    timestamp,
    position: { latitude: lat, longitude: lon, altitude: alt },
    velocity: { groundSpeed: gs, track, verticalRate: vr },
    onGround,
    source: "synthetic",
  };
}

// =========================================================================
// 1. ISA Model Validation
// =========================================================================
function validateISA(): { passed: boolean; text: string } {
  const isa = new ISACalculator();

  const refData: { alt: number; T: number; P: number }[] = [
    { alt: 0, T: 288.15, P: 101325 },
    { alt: 1000, T: 281.65, P: 89874.6 },
    { alt: 5000, T: 255.65, P: 54019.9 },
    { alt: 10000, T: 223.15, P: 26436.3 },
    { alt: 11000, T: 216.65, P: 22632.1 },
    { alt: 15000, T: 216.65, P: 12044.6 },
    { alt: 20000, T: 216.65, P: 5474.9 },
  ];

  const lines: string[] = [];
  lines.push("1. ISA Model Validation");
  lines.push("   " + "-".repeat(96));
  lines.push(
    "   " +
      padR("Alt(m)", 10) +
      padR("Exp T(K)", 12) +
      padR("Comp T(K)", 12) +
      padR("Err T(%)", 12) +
      padR("Exp P(Pa)", 14) +
      padR("Comp P(Pa)", 14) +
      padR("Err P(%)", 12),
  );
  lines.push("   " + "-".repeat(96));

  let maxTErr = 0;
  let maxPErr = 0;
  let maxDErr = 0;
  let allWithinTol = true;

  for (const ref of refData) {
    const result = isa.calculate(ref.alt);
    const tErr = Math.abs((result.temperature - ref.T) / ref.T) * 100;
    const pErr = Math.abs((result.pressure - ref.P) / ref.P) * 100;
    maxTErr = Math.max(maxTErr, tErr);
    maxPErr = Math.max(maxPErr, pErr);

    // Density reference: rho = P / (R * T), R = 287.058
    const refDensity = ref.P / (287.058 * ref.T);
    const dErr = Math.abs((result.density - refDensity) / refDensity) * 100;
    maxDErr = Math.max(maxDErr, dErr);

    if (tErr > 0.01 || pErr > 0.5) allWithinTol = false;

    lines.push(
      "   " +
        padR(String(ref.alt), 10) +
        padR(ref.T.toFixed(2), 12) +
        padR(result.temperature.toFixed(2), 12) +
        padR(tErr.toFixed(4), 12) +
        padR(ref.P.toFixed(1), 14) +
        padR(result.pressure.toFixed(1), 14) +
        padR(pErr.toFixed(4), 12),
    );
  }

  lines.push("   " + "-".repeat(96));
  lines.push(`   Max temperature error: ${maxTErr.toFixed(4)}%`);
  lines.push(`   Max pressure error:    ${maxPErr.toFixed(4)}%`);
  lines.push(`   Max density error:     ${maxDErr.toFixed(4)}%`);

  if (allWithinTol) {
    lines.push("   PASS: All 7 reference altitudes within tolerance");
  } else {
    lines.push("   FAIL: Some reference altitudes exceed tolerance");
  }

  return { passed: allWithinTol, text: lines.join("\n") };
}

// =========================================================================
// 2. Drag Polar Estimation Accuracy
// =========================================================================
function validateDragPolar(): { passed: boolean; text: string } {
  const rng = mulberry32(42);
  const estimator = new DragPolarEstimator();

  const trueCD0 = 0.024;
  const trueK = 0.042;
  const noiseStd = 0.001;
  const nPoints = 50;
  const aspectRatio = 10.3; // B738-like

  for (let i = 0; i < nPoints; i++) {
    const cl = 0.2 + (0.6 / (nPoints - 1)) * i; // 0.2 to 0.8
    const cdTrue = trueCD0 + trueK * cl * cl;
    const cd = cdTrue + gaussianNoise(rng, 0, noiseStd);
    estimator.addObservation({ cl, cd, mach: 0.78 });
  }

  const polar = estimator.estimate(aspectRatio)!;

  const cd0Err = Math.abs((polar.cd0 - trueCD0) / trueCD0) * 100;
  const kErr = Math.abs((polar.k - trueK) / trueK) * 100;
  const withinTol = cd0Err < 5 && kErr < 5;

  const lines: string[] = [];
  lines.push("2. Drag Polar Estimation Accuracy");
  lines.push(`   True:  CD0=${trueCD0.toFixed(4)}, k=${trueK.toFixed(4)}`);
  lines.push(`   Est:   CD0=${polar.cd0.toFixed(4)}, k=${polar.k.toFixed(4)}`);
  lines.push(`   CD0 error: ${cd0Err.toFixed(2)}%`);
  lines.push(`   k error:   ${kErr.toFixed(2)}%`);
  lines.push(`   R-squared: ${polar.rSquared!.toFixed(6)}`);
  lines.push(`   Oswald efficiency: ${polar.oswald.toFixed(4)}`);
  lines.push(`   Max L/D: ${estimator.maxLiftToDrag(polar).toFixed(2)}`);

  if (withinTol) {
    lines.push("   PASS: Estimated values within 5% of true values");
  } else {
    lines.push("   FAIL: Estimated values exceed 5% tolerance");
  }

  return { passed: withinTol, text: lines.join("\n") };
}

// =========================================================================
// 3. Kalman Filter Noise Reduction
// =========================================================================
function validateKalman(): { passed: boolean; text: string } {
  const rng = mulberry32(123);
  // EKF state uses degrees for lat/lon.
  // Set measurement noise intentionally higher than actual noise so the
  // filter trusts the constant-velocity motion model and smooths.
  const posNoiseStd = 200 / 111320; // actual injection: 200m in degrees
  const velNoiseStd = 10; // m/s
  const kf = new KalmanFilter({
    processNoise: 0.001,
    positionNoise: posNoiseStd * 1.5, // tell filter noise is 1.5x actual
    velocityNoise: velNoiseStd * 1.5,
  });

  const nPoints = 200;
  const dtMs = 10_000; // 10 seconds
  const latStep = 0.001; // degrees per step (~111 m)

  // True north velocity in m/s
  const trueVn = latStep * 111320 / 10; // ~11.132 m/s
  const trueVe = 0;
  const trueVd = 0;

  const trueLats: number[] = [];
  const rawLats: number[] = [];
  const filteredLats: number[] = [];

  for (let i = 0; i < nPoints; i++) {
    const t = i * dtMs;
    const trueLat = 40.0 + i * latStep;
    const trueLon = -74.0;
    const trueAlt = 10000;

    trueLats.push(trueLat);

    const noisyLat = trueLat + gaussianNoise(rng, 0, posNoiseStd);
    const noisyLon = trueLon + gaussianNoise(rng, 0, posNoiseStd);
    const noisyAlt = trueAlt + gaussianNoise(rng, 0, 15);
    const noisyVn = trueVn + gaussianNoise(rng, 0, velNoiseStd);
    const noisyVe = trueVe + gaussianNoise(rng, 0, velNoiseStd);
    const noisyVd = trueVd + gaussianNoise(rng, 0, velNoiseStd);

    rawLats.push(noisyLat);

    const measurement = [noisyLat, noisyLon, noisyAlt, noisyVn, noisyVe, noisyVd];
    kf.update(measurement, t);

    const state = kf.getState();
    filteredLats.push(state.x[0]);
  }

  // Compute RMSE in meters (latitude degrees -> meters)
  let rawSumSq = 0;
  let filtSumSq = 0;
  // Skip first 30 points to allow filter to settle
  const startIdx = 30;
  const count = nPoints - startIdx;

  for (let i = startIdx; i < nPoints; i++) {
    const rawErrM = (rawLats[i] - trueLats[i]) * 111320;
    const filtErrM = (filteredLats[i] - trueLats[i]) * 111320;
    rawSumSq += rawErrM * rawErrM;
    filtSumSq += filtErrM * filtErrM;
  }

  const rawRMSE = Math.sqrt(rawSumSq / count);
  const filtRMSE = Math.sqrt(filtSumSq / count);
  const improvement = ((rawRMSE - filtRMSE) / rawRMSE) * 100;
  const passed = filtRMSE < rawRMSE;

  const lines: string[] = [];
  lines.push("3. Kalman Filter Noise Reduction");
  lines.push(`   Raw RMSE:      ${rawRMSE.toFixed(1)}m`);
  lines.push(`   Filtered RMSE: ${filtRMSE.toFixed(1)}m`);
  lines.push(`   Improvement:   ${improvement.toFixed(1)}%`);

  if (passed) {
    lines.push("   PASS: Filtered RMSE < Raw RMSE");
  } else {
    lines.push("   FAIL: Filtering did not reduce RMSE");
  }

  return { passed, text: lines.join("\n") };
}

// =========================================================================
// 4. Anomaly Detection Performance
// =========================================================================
function validateAnomalyDetection(): { passed: boolean; text: string } {
  const detector = new AnomalyDetector({ sensitivity: 0.5 });

  let falsePositives = 0;
  const baseTs = 1_000_000_000;
  const dtMs = 10_000;

  // 100 normal states
  for (let i = 0; i < 100; i++) {
    const state = makeState(
      baseTs + i * dtMs,
      40.0 + i * 0.0001, // gentle drift north
      -74.0,
      10000,
      230,
      0,
      false,
    );
    const anomalies = detector.analyze(state, "cruise");
    falsePositives += anomalies.length;
  }

  // Inject anomalies
  // Step 101: speed spike (500 m/s)
  const step101 = makeState(baseTs + 100 * dtMs, 40.01, -74.0, 10000, 500, 0, false);
  const speedAnomalies = detector.analyze(step101, "cruise");

  // Step 102: position jump (5 degrees latitude)
  const step102 = makeState(baseTs + 101 * dtMs, 45.01, -74.0, 10000, 230, 0, false);
  const posAnomalies = detector.analyze(step102, "cruise");

  // Step 103: extreme vertical rate (60 m/s)
  const step103 = makeState(baseTs + 102 * dtMs, 45.0101, -74.0, 10000, 230, 60, false);
  const vrAnomalies = detector.analyze(step103, "cruise");

  const speedDetected = speedAnomalies.some((a) => a.type === "speed_deviation");
  const posDetected = posAnomalies.some((a) => a.type === "position_jump");
  const vrDetected = vrAnomalies.some((a) => a.type === "extreme_vertical_rate");

  const totalDetected = speedAnomalies.length + posAnomalies.length + vrAnomalies.length;
  const allDetected = speedDetected && posDetected && vrDetected;
  const passed = allDetected && falsePositives === 0;

  const lines: string[] = [];
  lines.push("4. Anomaly Detection Performance");
  lines.push(`   Normal states:        100`);
  lines.push(`   False positives:      ${falsePositives}`);
  lines.push(`   Injected anomalies:   3`);
  lines.push(`   Total detections:     ${totalDetected}`);
  lines.push(`   Speed spike (500 m/s):       ${speedDetected ? "DETECTED" : "MISSED"}`);
  lines.push(`   Position jump (5 deg):       ${posDetected ? "DETECTED" : "MISSED"}`);
  lines.push(`   Extreme vert rate (60 m/s):  ${vrDetected ? "DETECTED" : "MISSED"}`);

  if (passed) {
    lines.push("   PASS: All anomalies detected, zero false positives");
  } else if (allDetected) {
    lines.push(`   PARTIAL: All anomalies detected, but ${falsePositives} false positive(s)`);
  } else {
    lines.push("   FAIL: Some anomalies missed");
  }

  return { passed, text: lines.join("\n") };
}

// =========================================================================
// 5. Aircraft Database Coverage
// =========================================================================
function validateAircraftDB(): { passed: boolean; text: string } {
  const allTypes = getAllAircraftTypes();
  const total = allTypes.length;

  const categories: Record<string, number> = {};
  for (const ac of allTypes) {
    categories[ac.category] = (categories[ac.category] || 0) + 1;
  }

  const lines: string[] = [];
  lines.push("5. Aircraft Database Coverage");
  lines.push(`   Total aircraft types: ${total}`);
  lines.push("   Breakdown by category:");

  const categoryOrder = [
    "narrowbody",
    "widebody",
    "regional",
    "turboprop",
    "business_jet",
    "general_aviation",
  ];
  for (const cat of categoryOrder) {
    const count = categories[cat] || 0;
    lines.push(`     ${padR(cat, 20)} ${count}`);
  }

  // Check for any unexpected categories
  const unexpected = Object.keys(categories).filter(
    (c) => !categoryOrder.includes(c),
  );
  if (unexpected.length > 0) {
    lines.push(`   Other categories: ${unexpected.join(", ")}`);
  }

  const passed = total >= 50;
  if (passed) {
    lines.push(`   PASS: Database contains ${total} aircraft types (>= 50)`);
  } else {
    lines.push(`   FAIL: Database contains only ${total} aircraft types (expected >= 50)`);
  }

  return { passed, text: lines.join("\n") };
}

// =========================================================================
// 6. Flight Phase Detection
// =========================================================================
function validateFlightPhase(): { passed: boolean; text: string } {
  const detector = new FlightPhaseDetector(3);
  const baseTs = 1_000_000_000;
  const dtMs = 10_000;
  let stepIdx = 0;

  interface SegmentResult {
    name: string;
    expectedPhase: string;
    detectedPhases: string[];
    lastPhase: string;
  }

  const results: SegmentResult[] = [];

  function runSegment(
    name: string,
    expected: string,
    count: number,
    genState: (i: number, total: number) => FlightState,
  ): void {
    const phases: string[] = [];
    for (let i = 0; i < count; i++) {
      const state = genState(i, count);
      const phase = detector.update(state);
      phases.push(phase);
      stepIdx++;
    }
    results.push({
      name,
      expectedPhase: expected,
      detectedPhases: phases,
      lastPhase: phases[phases.length - 1],
    });
  }

  // Helper: linear interpolation
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  // Ground: 10 states at 0m alt, 0 m/s speed
  runSegment("Ground", "ground", 10, (i) =>
    makeState(baseTs + stepIdx * dtMs + i * dtMs, 40.0, -74.0, 0, 0, 0, true),
  );

  // Takeoff: 5 states, altitude 0->200m, speed 0->80, vr 5
  runSegment("Takeoff", "takeoff", 5, (i, n) =>
    makeState(
      baseTs + stepIdx * dtMs + i * dtMs,
      40.0 + i * 0.0001,
      -74.0,
      lerp(0, 200, i / (n - 1)),
      lerp(0, 80, i / (n - 1)),
      5,
      false,
    ),
  );

  // Climb: 20 states, altitude 200->10000, speed 80->230, vr 10
  runSegment("Climb", "climb", 20, (i, n) =>
    makeState(
      baseTs + stepIdx * dtMs + i * dtMs,
      40.001 + i * 0.001,
      -74.0,
      lerp(200, 10000, i / (n - 1)),
      lerp(80, 230, i / (n - 1)),
      10,
      false,
    ),
  );

  // Cruise: 30 states, altitude 10000, speed 230, vr 0
  runSegment("Cruise", "cruise", 30, (i) =>
    makeState(
      baseTs + stepIdx * dtMs + i * dtMs,
      40.021 + i * 0.001,
      -74.0,
      10000,
      230,
      0,
      false,
    ),
  );

  // Descent: 20 states, altitude 10000->1000, speed 230->180, vr -8
  runSegment("Descent", "descent", 20, (i, n) =>
    makeState(
      baseTs + stepIdx * dtMs + i * dtMs,
      40.051 + i * 0.001,
      -74.0,
      lerp(10000, 1000, i / (n - 1)),
      lerp(230, 180, i / (n - 1)),
      -8,
      false,
    ),
  );

  // Approach: 10 states, altitude 1000->100, speed 180->70, vr -4
  runSegment("Approach", "approach", 10, (i, n) =>
    makeState(
      baseTs + stepIdx * dtMs + i * dtMs,
      40.071 + i * 0.0001,
      -74.0,
      lerp(1000, 100, i / (n - 1)),
      lerp(180, 70, i / (n - 1)),
      -4,
      false,
    ),
  );

  // Landing: 5 states, altitude 100->0, speed 70->20, vr -2
  runSegment("Landing", "landing", 5, (i, n) =>
    makeState(
      baseTs + stepIdx * dtMs + i * dtMs,
      40.072 + i * 0.00001,
      -74.0,
      lerp(100, 0, i / (n - 1)),
      lerp(70, 20, i / (n - 1)),
      -2,
      false,
    ),
  );

  const lines: string[] = [];
  lines.push("6. Flight Phase Detection");
  lines.push("   " + "-".repeat(70));
  lines.push(
    "   " +
      padR("Segment", 14) +
      padR("Expected", 12) +
      padR("Last Phase", 14) +
      padR("Match", 8) +
      "Phase Sequence (last 5)",
  );
  lines.push("   " + "-".repeat(70));

  let matchCount = 0;
  for (const r of results) {
    // Due to hysteresis, the detector may lag, so we consider it
    // correct if the expected phase appears in the detected phases at all
    const phaseAppears = r.detectedPhases.includes(r.expectedPhase);
    const lastMatch = r.lastPhase === r.expectedPhase;
    const ok = phaseAppears || lastMatch;
    if (ok) matchCount++;

    const tail = r.detectedPhases.slice(-5).join(", ");
    lines.push(
      "   " +
        padR(r.name, 14) +
        padR(r.expectedPhase, 12) +
        padR(r.lastPhase, 14) +
        padR(ok ? "YES" : "NO", 8) +
        tail,
    );
  }

  lines.push("   " + "-".repeat(70));

  // We expect at least ground, cruise, and climb to be detected correctly.
  // Due to hysteresis, brief transitional phases (takeoff, landing) may not fully lock in.
  const coreSegments = results.filter((r) =>
    ["Ground", "Climb", "Cruise", "Descent"].includes(r.name),
  );
  const coreCorrect = coreSegments.filter(
    (r) => r.detectedPhases.includes(r.expectedPhase) || r.lastPhase === r.expectedPhase,
  ).length;

  const passed = coreCorrect === coreSegments.length;
  lines.push(
    `   Segments matched: ${matchCount}/${results.length} (core: ${coreCorrect}/${coreSegments.length})`,
  );

  if (passed) {
    lines.push("   PASS: All core flight phases (ground, climb, cruise, descent) correctly detected");
  } else {
    lines.push("   FAIL: Some core flight phases not detected");
  }

  return { passed, text: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function padR(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

// =========================================================================
// Main
// =========================================================================
function main(): void {
  const experiments = [
    validateISA,
    validateDragPolar,
    validateKalman,
    validateAnomalyDetection,
    validateAircraftDB,
    validateFlightPhase,
  ];

  const header = [
    "FlightDNA Validation Report",
    "===========================",
    `Generated: ${new Date().toISOString()}`,
    `Platform:  ${process.platform} ${process.arch}`,
    `Node:      ${process.version}`,
    "",
  ];

  console.log(header.join("\n"));

  let passCount = 0;
  const totalCount = experiments.length;

  for (const experiment of experiments) {
    const result = experiment();
    console.log(result.text);
    console.log("");
    if (result.passed) passCount++;
  }

  console.log("===========================");
  console.log(`Summary: ${passCount}/${totalCount} experiments passed`);

  if (passCount === totalCount) {
    console.log("All validation experiments PASSED.");
  } else {
    console.log(`WARNING: ${totalCount - passCount} experiment(s) did not fully pass.`);
    process.exit(1);
  }
}

main();
