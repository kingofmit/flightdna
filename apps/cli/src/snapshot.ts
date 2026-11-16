import { OpenSkyClient } from "@flightdna/adsb";

export async function snapshotCommand(options: {
  bounds?: string;
  format: string;
}) {
  const client = new OpenSkyClient();

  const params: { bounds?: [number, number, number, number] } = {};

  if (options.bounds) {
    const parts = options.bounds.split(",").map(Number);
    if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
      params.bounds = parts as [number, number, number, number];
      console.log(`Fetching aircraft in bounds: ${options.bounds}`);
    }
  } else {
    console.log("Fetching all visible aircraft (this may take a moment)...");
  }

  const states = await client.getStates(params);

  if (options.format === "json") {
    console.log(JSON.stringify(states, null, 2));
  } else {
    console.log(`\nFound ${states.length} aircraft\n`);
    console.log(
      "ICAO24   | Callsign | Alt (ft) | GS (kts) | Track | VS (fpm) | Position",
    );
    console.log("-".repeat(90));

    for (const s of states.slice(0, 50)) {
      const altFt = Math.round(s.position.altitude * 3.28084);
      const gsKts = Math.round(s.velocity.groundSpeed * 1.94384);
      const vrFpm = Math.round(s.velocity.verticalRate * 196.85);
      const trk = Math.round(s.velocity.track);
      const callsign = (s.aircraft.callsign || "").padEnd(8);
      const lat = s.position.latitude.toFixed(4);
      const lon = s.position.longitude.toFixed(4);

      console.log(
        `${s.aircraft.icao24.toUpperCase()} | ${callsign} | ${String(altFt).padStart(7)} | ${String(gsKts).padStart(7)} | ${String(trk).padStart(5)}\u00b0 | ${String(vrFpm).padStart(7)} | ${lat}, ${lon}`,
      );
    }

    if (states.length > 50) {
      console.log(`\n... and ${states.length - 50} more aircraft`);
    }
  }
}
