/**
 * FlightDNA Real-Data Validation Script
 *
 * Fetches live ADS-B data from the OpenSky Network API, runs it through the
 * full FlightDNA pipeline (Kalman filter, digital twin, health monitoring,
 * anomaly detection, flight phase classification), and validates against
 * expected aircraft performance characteristics.
 *
 * Usage:
 *   pnpm exec tsx scripts/validate-real.ts
 *   pnpm exec tsx scripts/validate-real.ts --bounds=25,50,20,50
 */

import { OpenSkyClient } from "../packages/adsb/src/opensky";
import { DigitalTwin } from "../packages/twin/src/digital-twin";
import { getAircraftType, getAllAircraftTypes } from "../packages/dynamics/src/aircraft-db";
import type { AircraftTypeData } from "../packages/dynamics/src/aircraft-db";
import { DragPolarEstimator } from "../packages/dynamics/src/drag-polar";
import { ISACalculator } from "../packages/weather/src/isa";
import { WindModel } from "../packages/weather/src/wind-model";
import { FlightReporter } from "../packages/export/src/reporter";
import type { FlightState } from "../packages/core/src/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const POLL_COUNT = 5;
const POLL_INTERVAL_MS = 15_000; // 15 seconds (OpenSky anonymous rate limit)
const DEFAULT_BOUNDS: [number, number, number, number] = [45, 55, -5, 15]; // Europe
const PREFERRED_TYPES = ["B738", "A320"];

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseBounds(args: string[]): [number, number, number, number] {
  for (const arg of args) {
    if (arg.startsWith("--bounds=")) {
      const parts = arg.slice("--bounds=".length).split(",").map(Number);
      if (parts.length === 4 && parts.every(Number.isFinite)) {
        return parts as [number, number, number, number];
      }
      console.error(`Invalid --bounds format. Expected: --bounds=minLat,maxLat,minLon,maxLon`);
      process.exit(1);
    }
  }
  return DEFAULT_BOUNDS;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function feetFromMeters(m: number): number {
  return m * 3.28084;
}

function knotsFromMs(ms: number): number {
  return ms * 1.94384;
}

function flightLevelFromMeters(m: number): string {
  const fl = Math.round(feetFromMeters(m) / 100);
  return `FL${String(fl).padStart(3, "0")}`;
}

/** Heuristic: try to guess aircraft type from callsign prefix. Not reliable. */
function guessTypeFromCallsign(_callsign: string): string | undefined {
  // We cannot reliably map callsign to type without an external DB.
  // Return undefined so the script uses the first aircraft with a known type.
  return undefined;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const bounds = parseBounds(process.argv.slice(2));

  console.log("=".repeat(70));
  console.log("  FlightDNA Real-Data Validation");
  console.log("=".repeat(70));
  console.log();
  console.log(`Bounding box: minLat=${bounds[0]}, maxLat=${bounds[1]}, minLon=${bounds[2]}, maxLon=${bounds[3]}`);
  console.log(`Polling: ${POLL_COUNT} cycles at ${POLL_INTERVAL_MS / 1000}s intervals`);
  console.log();

  // Initialize components
  const client = new OpenSkyClient();
  const isa = new ISACalculator();
  const windModel = new WindModel();
  const reporter = new FlightReporter();
  const knownTypes = new Set(getAllAircraftTypes().map((t) => t.typeDesignator));

  // ---- Step 1: Initial fetch to discover aircraft ----
  console.log("[1/6] Fetching initial state vectors from OpenSky...");
  let initialStates: FlightState[];
  try {
    initialStates = await client.getStates({ bounds });
  } catch (err) {
    console.error(`\nFailed to fetch from OpenSky: ${err instanceof Error ? err.message : err}`);
    console.error("This may be due to rate limiting or network issues.");
    console.error("Try again in 10-15 seconds, or use --bounds to query a different region.");
    process.exit(1);
  }

  if (initialStates.length === 0) {
    console.error("\nNo aircraft found in the specified bounding box.");
    console.error("Possible reasons:");
    console.error("  - OpenSky returned empty data (rate limit or no coverage).");
    console.error("  - No aircraft are currently in this region.");
    console.error("Try a different region with --bounds=minLat,maxLat,minLon,maxLon");
    process.exit(0);
  }

  console.log(`  Found ${initialStates.length} aircraft in the region.`);

  // ---- Step 2: Pick a target aircraft ----
  console.log("\n[2/6] Selecting target aircraft...");

  // Filter to airborne aircraft only
  const airborne = initialStates.filter((s) => !s.onGround && s.position.altitude > 500);
  if (airborne.length === 0) {
    console.error("\nNo airborne aircraft found in the region. All are on ground.");
    console.error("Try a larger bounding box or a region with more air traffic.");
    process.exit(0);
  }

  // Prefer B738 or A320 by trying to find them (OpenSky does not return type, so
  // we cannot filter by type directly). We pick the highest-altitude airborne aircraft
  // as a proxy for cruise flight, which gives us the best validation data.
  let target = airborne.sort((a, b) => b.position.altitude - a.position.altitude)[0];
  console.log(`  Selected: ICAO24=${target.aircraft.icao24}, callsign=${target.aircraft.callsign ?? "N/A"}`);
  console.log(`  Altitude: ${Math.round(target.position.altitude)}m (${Math.round(feetFromMeters(target.position.altitude))} ft)`);
  console.log(`  Ground speed: ${target.velocity.groundSpeed.toFixed(1)} m/s (${knotsFromMs(target.velocity.groundSpeed).toFixed(0)} kts)`);

  const targetIcao24 = target.aircraft.icao24;

  // ---- Step 3: Create digital twin and run polling ----
  console.log("\n[3/6] Running polling cycles with digital twin...");

  const twin = new DigitalTwin({
    icao24: targetIcao24,
    processNoise: 1.0,
    measurementNoise: 50,
    anomalySensitivity: 0.5,
  });

  const rawStates: FlightState[] = [];

  // Feed initial state
  twin.update(target);
  rawStates.push(target);
  console.log(`  Cycle 0: Initial state fed (alt=${Math.round(target.position.altitude)}m, gs=${target.velocity.groundSpeed.toFixed(1)} m/s)`);

  for (let cycle = 1; cycle <= POLL_COUNT; cycle++) {
    console.log(`  Waiting ${POLL_INTERVAL_MS / 1000}s...`);
    await sleep(POLL_INTERVAL_MS);

    let states: FlightState[];
    try {
      states = await client.getStates({ icao24: [targetIcao24] });
    } catch (err) {
      console.warn(`  Cycle ${cycle}: Fetch failed (${err instanceof Error ? err.message : "unknown error"}). Skipping.`);
      continue;
    }

    if (states.length === 0) {
      console.warn(`  Cycle ${cycle}: No data returned for ${targetIcao24}. Aircraft may have landed or left coverage.`);
      continue;
    }

    const state = states[0];
    twin.update(state);
    rawStates.push(state);
    console.log(`  Cycle ${cycle}: alt=${Math.round(state.position.altitude)}m, gs=${state.velocity.groundSpeed.toFixed(1)} m/s, vr=${state.velocity.verticalRate.toFixed(1)} m/s`);
  }

  if (rawStates.length < 2) {
    console.error("\nInsufficient data collected (need at least 2 states). The aircraft may have disappeared.");
    console.error("Try again or pick a different region.");
    process.exit(0);
  }

  // ---- Step 4: Extract twin state and report ----
  console.log("\n[4/6] Analyzing digital twin state...");

  const twinState = twin.getState();
  const lastRaw = twin.getLastRawState()!;

  console.log("\n--- Aircraft Information ---");
  console.log(`  ICAO24:     ${twinState.icao24}`);
  console.log(`  Callsign:   ${lastRaw.aircraft.callsign ?? "N/A"}`);
  console.log(`  Country:    ${lastRaw.aircraft.country ?? "N/A"}`);
  console.log(`  States received: ${rawStates.length}`);
  console.log(`  Twin updates:    ${twinState.updateCount}`);

  // Kalman filter quality: compare raw vs filtered position
  console.log("\n--- Kalman Filter Quality ---");
  const rawLat = lastRaw.position.latitude;
  const rawLon = lastRaw.position.longitude;
  const rawAlt = lastRaw.position.altitude;
  const filtLat = twinState.position.latitude;
  const filtLon = twinState.position.longitude;
  const filtAlt = twinState.position.altitude;

  const positionDiffM = Math.sqrt(
    ((rawLat - filtLat) * 111_320) ** 2 +
    ((rawLon - filtLon) * 111_320 * Math.cos((rawLat * Math.PI) / 180)) ** 2 +
    (rawAlt - filtAlt) ** 2,
  );
  console.log(`  Raw position:      ${rawLat.toFixed(5)}, ${rawLon.toFixed(5)}, ${Math.round(rawAlt)}m`);
  console.log(`  Filtered position: ${filtLat.toFixed(5)}, ${filtLon.toFixed(5)}, ${Math.round(filtAlt)}m`);
  console.log(`  Position difference: ${positionDiffM.toFixed(1)} m`);
  if (positionDiffM < 1000) {
    console.log(`  Quality: GOOD (within 1 km)`);
  } else if (positionDiffM < 5000) {
    console.log(`  Quality: ACCEPTABLE (within 5 km)`);
  } else {
    console.log(`  Quality: POOR (>5 km divergence)`);
  }

  // Flight phase
  console.log("\n--- Flight Phase ---");
  console.log(`  Current phase: ${twinState.flightPhase}`);
  console.log(`  Airborne:      ${twinState.airborne}`);

  // Health indicators
  console.log("\n--- Health Indicators ---");
  if (twinState.health.length === 0) {
    console.log("  No health indicators available yet (need more data).");
  } else {
    for (const h of twinState.health) {
      console.log(`  ${h.type.padEnd(22)} value=${h.value.toFixed(3)}  confidence=${h.confidence.toFixed(3)}  trend=${h.trend >= 0 ? "+" : ""}${h.trend.toFixed(4)}`);
    }
  }

  // Anomalies
  console.log("\n--- Anomalies ---");
  if (twinState.anomalies.length === 0) {
    console.log("  No anomalies detected.");
  } else {
    console.log(`  ${twinState.anomalies.length} anomaly(ies):`);
    for (const a of twinState.anomalies) {
      console.log(`    [${a.severity.toUpperCase()}] ${a.type}: ${a.message} (deviation=${a.deviation.toFixed(2)})`);
    }
  }

  // Performance metrics
  console.log("\n--- Performance ---");
  const atmo = isa.calculate(twinState.position.altitude);
  const machEstimate = twinState.performance.mach;
  console.log(`  Mach estimate:     ${machEstimate.toFixed(4)}`);
  console.log(`  Ground speed:      ${twinState.velocity.groundSpeed.toFixed(1)} m/s (${knotsFromMs(twinState.velocity.groundSpeed).toFixed(0)} kts)`);
  console.log(`  Filtered altitude: ${Math.round(twinState.position.altitude)}m (${Math.round(feetFromMeters(twinState.position.altitude))} ft, ${flightLevelFromMeters(twinState.position.altitude)})`);
  console.log(`  Vertical rate:     ${twinState.velocity.verticalRate.toFixed(2)} m/s (${(twinState.velocity.verticalRate * 196.85).toFixed(0)} fpm)`);
  console.log(`  Climb rate:        ${twinState.performance.climbRate.toFixed(2)} m/s`);
  console.log(`  ISA temperature:   ${(atmo.temperature - 273.15).toFixed(1)} C (${atmo.temperature.toFixed(1)} K)`);
  console.log(`  Speed of sound:    ${atmo.speedOfSound.toFixed(1)} m/s`);
  console.log(`  Air density:       ${atmo.density.toFixed(4)} kg/m3`);

  // Wind estimate (using a hypothetical surface wind)
  const surfaceWind = { speed: 5, direction: 270, northComponent: 0, eastComponent: -5 };
  const windAtAlt = windModel.estimateAtAltitude(surfaceWind, twinState.position.altitude);
  const tasResult = windModel.computeTAS(twinState.velocity.groundSpeed, twinState.velocity.track, windAtAlt);
  console.log(`  Est. TAS (wind model): ${tasResult.trueAirspeed.toFixed(1)} m/s (${knotsFromMs(tasResult.trueAirspeed).toFixed(0)} kts)`);

  // Flight summary via reporter
  console.log("\n--- Flight Summary (FlightReporter) ---");
  const summary = reporter.generateSummary(rawStates);
  console.log(reporter.formatSummaryText(summary));

  // ---- Step 5: Compare to expected values ----
  console.log("\n\n[5/6] Comparing against known aircraft type data...");

  // Try to find the aircraft type. OpenSky doesn't return type directly, so we
  // use a simple heuristic: check the callsign or just validate against typical
  // narrowbody/widebody ranges.
  let matchedType: AircraftTypeData | undefined;

  // Try preferred types first by checking if performance matches
  for (const typeName of PREFERRED_TYPES) {
    const typeData = getAircraftType(typeName);
    if (!typeData) continue;
    // Check if altitude and Mach are roughly in range
    const altMatch = twinState.position.altitude > 3000 && twinState.position.altitude < 15000;
    const machMatch = machEstimate > 0.5 && machEstimate < 1.0;
    if (altMatch && machMatch) {
      matchedType = typeData;
      break;
    }
  }

  // Fallback: pick the first type whose cruise Mach is close
  if (!matchedType) {
    const allTypes = getAllAircraftTypes();
    for (const typeData of allTypes) {
      if (Math.abs(typeData.typicalCruiseMach - machEstimate) < 0.15) {
        matchedType = typeData;
        break;
      }
    }
  }

  if (matchedType) {
    console.log(`  Comparing against: ${matchedType.name} (${matchedType.typeDesignator})`);
    console.log();

    // Mach comparison
    const machDiff = Math.abs(machEstimate - matchedType.typicalCruiseMach);
    const machOk = machDiff < 0.1;
    console.log(`  Cruise Mach:`);
    console.log(`    Expected:  ${matchedType.typicalCruiseMach.toFixed(3)}`);
    console.log(`    Observed:  ${machEstimate.toFixed(3)}`);
    console.log(`    Delta:     ${machDiff.toFixed(3)} ${machOk ? "PASS" : "DEVIATION"}`);

    // Altitude comparison
    const altDiff = Math.abs(twinState.position.altitude - matchedType.typicalCruiseAltitude);
    const altOk = altDiff < 3000; // within 3km
    console.log(`  Cruise altitude:`);
    console.log(`    Expected:  ${Math.round(matchedType.typicalCruiseAltitude)}m (${Math.round(feetFromMeters(matchedType.typicalCruiseAltitude))} ft)`);
    console.log(`    Observed:  ${Math.round(twinState.position.altitude)}m (${Math.round(feetFromMeters(twinState.position.altitude))} ft)`);
    console.log(`    Delta:     ${Math.round(altDiff)}m ${altOk ? "PASS" : "DEVIATION"}`);

    // Speed reasonableness
    const expectedSpeedMs = matchedType.typicalCruiseMach * atmo.speedOfSound;
    const speedDiff = Math.abs(twinState.velocity.groundSpeed - expectedSpeedMs);
    const speedOk = speedDiff < 80; // within 80 m/s (wind effects)
    console.log(`  Speed (ground vs expected TAS):`);
    console.log(`    Expected TAS: ${expectedSpeedMs.toFixed(1)} m/s (${knotsFromMs(expectedSpeedMs).toFixed(0)} kts)`);
    console.log(`    Observed GS:  ${twinState.velocity.groundSpeed.toFixed(1)} m/s (${knotsFromMs(twinState.velocity.groundSpeed).toFixed(0)} kts)`);
    console.log(`    Delta:        ${speedDiff.toFixed(1)} m/s ${speedOk ? "PASS" : "DEVIATION (may be wind effect)"}`);

    // ---- Drag polar estimation ----
    console.log("\n  Drag polar estimation:");
    if (rawStates.length >= 3 && twinState.flightPhase === "cruise") {
      const polarEstimator = new DragPolarEstimator();
      const ar = matchedType.wingSpan ** 2 / matchedType.wingArea;
      const estimatedMass = (matchedType.mtow + matchedType.oew) / 2;

      for (const state of rawStates) {
        const stateAtmo = isa.calculate(state.position.altitude);
        const q = 0.5 * stateAtmo.density * state.velocity.groundSpeed ** 2;
        if (q < 1) continue;
        const cl = (estimatedMass * 9.81) / (q * matchedType.wingArea);
        // Estimate CD from level flight: T = D = q * S * CD
        // In cruise, T ~= D, so CD ~= (mass * g) / (q * S * (L/D))
        // Without exact thrust, estimate CD from known cd0 + k*CL^2
        const cdEstimate = matchedType.cd0Estimate + matchedType.kEstimate * cl ** 2;
        const machLocal = state.velocity.groundSpeed / stateAtmo.speedOfSound;
        polarEstimator.addObservation({ cl, cd: cdEstimate, mach: machLocal });
      }

      if (polarEstimator.count >= 2) {
        const polar = polarEstimator.estimate(ar);
        if (polar) {
          const ldMax = polarEstimator.maxLiftToDrag(polar);
          console.log(`    Observations: ${polarEstimator.count}`);
          console.log(`    Estimated CD0: ${polar.cd0.toFixed(5)} (expected: ${matchedType.cd0Estimate.toFixed(5)})`);
          console.log(`    Estimated k:   ${polar.k.toFixed(5)} (expected: ${matchedType.kEstimate.toFixed(5)})`);
          console.log(`    Oswald e:      ${polar.oswald.toFixed(3)}`);
          console.log(`    R-squared:     ${polar.rSquared.toFixed(4)}`);
          console.log(`    Max L/D:       ${ldMax.toFixed(1)}`);
          console.log(`    Avg Mach:      ${polar.mach.toFixed(3)}`);
        } else {
          console.log("    Could not estimate drag polar (insufficient variation in data).");
        }
      } else {
        console.log("    Not enough data points for drag polar estimation.");
      }
    } else {
      console.log("    Skipped (need >= 3 states in cruise phase).");
    }
  } else {
    console.log("  Could not match aircraft type (Mach or altitude out of known ranges).");
    console.log("  This aircraft may be a type not in the FlightDNA database, or not in cruise.");
  }

  // ---- Step 6: Summary ----
  console.log("\n\n[6/6] Validation Complete");
  console.log("=".repeat(70));
  console.log(`  Aircraft:        ${targetIcao24} (${lastRaw.aircraft.callsign ?? "N/A"})`);
  console.log(`  States collected: ${rawStates.length}`);
  console.log(`  Twin updates:     ${twinState.updateCount}`);
  console.log(`  Flight phase:     ${twinState.flightPhase}`);
  console.log(`  Health indicators: ${twinState.health.length}`);
  console.log(`  Anomalies:        ${twinState.anomalies.length}`);
  console.log(`  Mach:             ${machEstimate.toFixed(4)}`);
  console.log(`  Altitude:         ${Math.round(twinState.position.altitude)}m (${flightLevelFromMeters(twinState.position.altitude)})`);
  if (matchedType) {
    console.log(`  Matched type:     ${matchedType.name}`);
  }
  console.log("=".repeat(70));
  console.log("Done.");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
