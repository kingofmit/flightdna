import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { OpenSkyClient } from "@flightdna/adsb";
import { FleetManager } from "@flightdna/fleet";
import { ISACalculator } from "@flightdna/weather";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const POLL_INTERVAL = 15_000;
// Default bounds: Europe (can be overridden via --bounds=lat1,lat2,lon1,lon2)
const DEFAULT_BOUNDS: [number, number, number, number] = [45, 55, -5, 15];

const adsb = new OpenSkyClient();
const fleet = new FleetManager("dashboard");
const isa = new ISACalculator();

// Parse bounds from command-line args
const boundsArg = process.argv.find((a) => a.startsWith("--bounds="));
const bounds = boundsArg
  ? (boundsArg.split("=")[1].split(",").map(Number) as [number, number, number, number])
  : DEFAULT_BOUNDS;

console.log(`FlightDNA Dashboard — polling bounds: ${bounds.join(", ")}`);

// HTTP server for static files
const server = createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(readFileSync(join(__dirname, "../public/index.html"), "utf-8"));
  } else if (req.url === "/api/stats") {
    const analytics = fleet.getAnalytics();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        aircraftCount: analytics.aircraftCount,
        airborneCount: analytics.airborneCount,
        averageHealth: analytics.averageHealth,
        totalAnomalies: analytics.totalAnomalies,
      }),
    );
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

// WebSocket server
const wss = new WebSocketServer({ server });

function broadcast(data: unknown): void {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// Polling loop
async function poll(): Promise<void> {
  try {
    const states = await adsb.getStates({ bounds });

    for (const state of states) {
      const icao24 = state.aircraft.icao24.toLowerCase();
      if (!fleet.getAircraft(icao24)) {
        fleet.addAircraft(icao24, state.aircraft);
      }
      fleet.update(state);
    }

    // Build update payload
    const aircraft = fleet
      .getAllAircraft()
      .filter((a) => a.twinState)
      .map((a) => {
        const ts = a.twinState!;
        const atmo = isa.calculate(ts.position.altitude);
        return {
          icao24: ts.icao24,
          callsign: a.aircraft.callsign ?? null,
          type: a.aircraft.typeDesignator ?? null,
          lat: ts.position.latitude,
          lon: ts.position.longitude,
          alt: Math.round(ts.position.altitude),
          altFt: Math.round(ts.position.altitude * 3.28084),
          gs: Math.round(ts.velocity.groundSpeed),
          gsKts: Math.round(ts.velocity.groundSpeed * 1.94384),
          track: Math.round(ts.velocity.track),
          vr: Math.round(ts.velocity.verticalRate * 196.85), // fpm
          mach: ts.performance.mach.toFixed(3),
          phase: ts.flightPhase,
          health: ts.health.find((h) => h.type === "overall")?.value ?? 1,
          anomalies: ts.anomalies.length,
          temperature: Math.round(atmo.temperature - 273.15), // Celsius
          speedOfSound: Math.round(atmo.speedOfSound),
        };
      });

    broadcast({ type: "update", aircraft, timestamp: Date.now() });

    console.log(`[${new Date().toISOString()}] ${aircraft.length} aircraft tracked`);
  } catch (err) {
    console.error("Poll error:", err instanceof Error ? err.message : err);
  }
}

server.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
  console.log(`WebSocket on ws://localhost:${PORT}`);
  void poll();
  setInterval(() => void poll(), POLL_INTERVAL);
});
