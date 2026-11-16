const args = process.argv.slice(2);
const command = args[0];

function getFlag(flag: string, defaultVal: string): string {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultVal;
}

switch (command) {
  case "track": {
    const icao24 = args[1];
    if (!icao24) {
      console.error("Usage: flightdna track <icao24>");
      process.exit(1);
    }
    const interval = parseInt(getFlag("--interval", "15000"), 10);
    const format = getFlag("--format", "table");
    import("./track").then((m) => m.trackCommand(icao24, { interval, format }));
    break;
  }
  case "analyze": {
    const file = args[1];
    if (!file) {
      console.error("Usage: flightdna analyze <file.csv>");
      process.exit(1);
    }
    const output = getFlag("--output", "");
    const format = getFlag("--format", "csv");
    import("./analyze").then((m) =>
      m.analyzeCommand(file, { output: output || undefined, format }),
    );
    break;
  }
  case "snapshot": {
    const bounds = getFlag("--bounds", "");
    const format = getFlag("--format", "table");
    import("./snapshot").then((m) =>
      m.snapshotCommand({ bounds: bounds || undefined, format }),
    );
    break;
  }
  case "version":
    console.log("flightdna v0.1.0");
    break;
  case "--help":
  case "-h":
  case "help":
  case undefined:
    console.log(`
FlightDNA — Aircraft Digital Twin Framework

Usage: flightdna <command> [options]

Commands:
  track <icao24>     Track aircraft in real-time via OpenSky Network
    --interval <ms>    Polling interval (default: 15000)
    --format <fmt>     Output format: table, json (default: table)

  analyze <file.csv>  Analyze historical flight data from CSV
    --output <file>    Export results to file
    --format <fmt>     Export format: csv, json, geojson (default: csv)

  snapshot             Get snapshot of all visible aircraft
    --bounds <b>       Bounding box: minLat,maxLat,minLon,maxLon
    --format <fmt>     Output format: table, json (default: table)

  version              Print version

Examples:
  flightdna track a835af
  flightdna track 4840d6 --interval 10000 --format json
  flightdna analyze flight.csv --output result.geojson --format geojson
  flightdna snapshot --bounds 45,55,-5,15
`);
    break;
  default:
    console.error(`Unknown command: ${command}. Use --help for usage.`);
    process.exit(1);
}
