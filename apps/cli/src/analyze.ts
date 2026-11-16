import { readFileSync, writeFileSync } from "node:fs";
import { DigitalTwin } from "@flightdna/twin";
import { FlightReporter, CSVExporter, JSONExporter } from "@flightdna/export";
import type { FlightState } from "@flightdna/core";

export async function analyzeCommand(
  filePath: string,
  options: { output?: string; format: string },
) {
  console.log(`Analyzing ${filePath}...`);

  // Parse CSV
  const content = readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());

  const states: FlightState[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx];
    });

    // Map common CSV column names to FlightState
    const state: FlightState = {
      aircraft: {
        icao24: row["icao24"] || row["hex"] || "unknown",
        callsign: row["callsign"] || undefined,
      },
      timestamp: Number(row["timestamp"] || row["time"] || Date.now()),
      position: {
        latitude: Number(row["latitude"] || row["lat"] || 0),
        longitude: Number(row["longitude"] || row["lon"] || 0),
        altitude: Number(row["altitude"] || row["alt"] || 0),
      },
      velocity: {
        groundSpeed: Number(
          row["groundSpeed"] || row["velocity"] || row["gs"] || 0,
        ),
        track: Number(row["track"] || row["trk"] || 0),
        verticalRate: Number(
          row["verticalRate"] || row["vrate"] || row["vs"] || 0,
        ),
      },
      onGround: row["onGround"] === "true",
      source: "csv",
    };

    states.push(state);
  }

  console.log(`Loaded ${states.length} state records.`);

  if (states.length === 0) {
    console.error("No valid states found in file.");
    process.exit(1);
  }

  // Run through digital twin
  const icao24 = states[0].aircraft.icao24;
  const twin = new DigitalTwin({ icao24 });

  const sortedStates = [...states].sort((a, b) => a.timestamp - b.timestamp);
  for (const state of sortedStates) {
    twin.update(state);
  }

  // Generate report
  const reporter = new FlightReporter();
  const summary = reporter.generateSummary(sortedStates);

  // Print summary
  const text = reporter.formatSummaryText(summary);
  console.log("\n" + text);

  // Print twin state
  const twinState = twin.getState();
  console.log(`\nDigital Twin Final State:`);
  console.log(`  Flight Phase: ${twinState.flightPhase}`);
  const overallHealth = twinState.health.find((h) => h.type === "overall");
  console.log(
    `  Health: ${overallHealth ? (overallHealth.value * 100).toFixed(1) : "100.0"}%`,
  );
  console.log(`  Anomalies Detected: ${twinState.anomalies.length}`);
  console.log(`  Updates Processed: ${twinState.updateCount}`);

  // Export if requested
  if (options.output) {
    let outputData: string;

    switch (options.format) {
      case "json": {
        const exporter = new JSONExporter();
        outputData = exporter.export(sortedStates);
        break;
      }
      case "geojson": {
        const exporter = new JSONExporter();
        outputData = exporter.exportTrajectory(sortedStates);
        break;
      }
      case "csv":
      default: {
        const exporter = new CSVExporter();
        outputData = exporter.export(sortedStates);
        break;
      }
    }

    writeFileSync(options.output, outputData, "utf-8");
    console.log(`\nExported to ${options.output} (${options.format})`);
  }
}
