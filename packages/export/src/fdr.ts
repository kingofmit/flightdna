import type { FlightState } from "@flightdna/core";

/**
 * Flight Data Recorder (FDR) format exporter.
 *
 * Exports data in a simplified FDR-compatible format with
 * standard parameter naming conventions.
 */
export class FDRExporter {
  /**
   * Standard FDR parameter names mapped to FlightState fields.
   */
  private static readonly PARAMETERS = [
    { name: "TIME", unit: "sec", getter: (s: FlightState) => s.timestamp / 1000 },
    { name: "LATP", unit: "deg", getter: (s: FlightState) => s.position.latitude },
    { name: "LONP", unit: "deg", getter: (s: FlightState) => s.position.longitude },
    { name: "ALT", unit: "ft", getter: (s: FlightState) => s.position.altitude * 3.28084 },
    { name: "GS", unit: "kts", getter: (s: FlightState) => s.velocity.groundSpeed * 1.94384 },
    { name: "TRK", unit: "deg", getter: (s: FlightState) => s.velocity.track },
    { name: "VRTG", unit: "fpm", getter: (s: FlightState) => s.velocity.verticalRate * 196.85 },
    { name: "HDGT", unit: "deg", getter: (s: FlightState) => s.velocity.heading ?? s.velocity.track },
    { name: "WOW", unit: "bool", getter: (s: FlightState) => s.onGround ? 1 : 0 },
  ];

  /**
   * Export flight states to FDR format.
   *
   * The output is a tab-separated text file with a header section
   * describing the parameters and their units, followed by data rows.
   */
  export(states: FlightState[]): string {
    const lines: string[] = [];

    // Header section
    lines.push("# FlightDNA FDR Export");
    lines.push(`# Aircraft: ${states[0]?.aircraft.icao24 ?? "unknown"}`);
    lines.push(`# Callsign: ${states[0]?.aircraft.callsign ?? "unknown"}`);
    lines.push(`# Data points: ${states.length}`);
    if (states.length > 0) {
      lines.push(
        `# Time range: ${new Date(states[0].timestamp).toISOString()} - ${new Date(states[states.length - 1].timestamp).toISOString()}`,
      );
    }
    lines.push("#");
    lines.push(
      "# Parameters: " +
        FDRExporter.PARAMETERS.map((p) => `${p.name}(${p.unit})`).join(", "),
    );
    lines.push("#");

    // Column headers
    lines.push(
      FDRExporter.PARAMETERS.map((p) => p.name).join("\t"),
    );

    // Data rows
    for (const state of states) {
      const values = FDRExporter.PARAMETERS.map((p) => {
        const val = p.getter(state);
        return typeof val === "number" ? val.toFixed(4) : String(val);
      });
      lines.push(values.join("\t"));
    }

    return lines.join("\n");
  }

  /**
   * Get the list of available FDR parameters.
   */
  getParameters(): Array<{ name: string; unit: string }> {
    return FDRExporter.PARAMETERS.map(({ name, unit }) => ({ name, unit }));
  }
}
