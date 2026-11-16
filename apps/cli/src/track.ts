import { OpenSkyClient } from "@flightdna/adsb";
import { DigitalTwin } from "@flightdna/twin";
import { ISACalculator } from "@flightdna/weather";

export async function trackCommand(
  icao24: string,
  options: { interval: number; format: string },
) {
  const client = new OpenSkyClient();
  const twin = new DigitalTwin({ icao24 });
  const isa = new ISACalculator();

  console.log(`Tracking aircraft ${icao24.toUpperCase()}...`);
  console.log(
    `Polling OpenSky every ${options.interval / 1000}s. Press Ctrl+C to stop.\n`,
  );

  const poll = async () => {
    try {
      const states = await client.getStates({ icao24: [icao24] });
      if (states.length === 0) {
        console.log(`[${new Date().toISOString()}] No data for ${icao24}`);
        return;
      }

      const state = states[0];
      twin.update(state);
      const twinState = twin.getState();

      // Get atmospheric conditions at aircraft altitude
      const atmo = isa.calculate(twinState.position.altitude);
      const mach = twinState.velocity.groundSpeed / atmo.speedOfSound;

      if (options.format === "json") {
        console.log(JSON.stringify(twinState));
      } else {
        // Table format
        const alt = Math.round(twinState.position.altitude);
        const altFt = Math.round(alt * 3.28084);
        const gs = Math.round(twinState.velocity.groundSpeed);
        const gsKts = Math.round(gs * 1.94384);
        const vr = twinState.velocity.verticalRate;
        const vrFpm = Math.round(vr * 196.85);
        const trk = Math.round(twinState.velocity.track);
        const phase = twinState.flightPhase ?? "unknown";
        const health = twinState.health.find((h) => h.type === "overall");
        const anomalyCount = twinState.anomalies.length;

        console.log(
          `[${new Date().toISOString()}] ` +
            `ALT: ${altFt}ft | GS: ${gsKts}kts | TRK: ${trk}° | ` +
            `VS: ${vrFpm > 0 ? "+" : ""}${vrFpm}fpm | ` +
            `M${mach.toFixed(3)} | ` +
            `Phase: ${phase} | ` +
            `Health: ${health ? (health.value * 100).toFixed(0) : "?"}% | ` +
            `Anomalies: ${anomalyCount}`,
        );
      }
    } catch (err) {
      console.error(`Poll error: ${err instanceof Error ? err.message : err}`);
    }
  };

  await poll();
  setInterval(() => void poll(), options.interval);
}
