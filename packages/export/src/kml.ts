import type { FlightState } from "@flightdna/core";

export interface KMLExportOptions {
  name?: string;
  description?: string;
  lineColor?: string;    // KML AABBGGRR format, default: "ff0000ff" (red)
  lineWidth?: number;    // default: 2
  colorByAltitude?: boolean; // default: false
  includeAnomalyMarkers?: boolean; // default: false
}

export class KMLExporter {
  export(states: FlightState[], options: KMLExportOptions = {}): string {
    const name = options.name ?? states[0]?.aircraft.callsign ?? states[0]?.aircraft.icao24 ?? "Flight";
    const desc = options.description ?? `${states.length} data points`;
    const lineColor = options.lineColor ?? "ff0000ff";
    const lineWidth = options.lineWidth ?? 2;

    const coordinates = states
      .map(s => `${s.position.longitude},${s.position.latitude},${s.position.altitude}`)
      .join("\n            ");

    const placemarks = this.buildPlacemarks(states, options);

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${this.escapeXml(name)}</name>
    <description>${this.escapeXml(desc)}</description>
    <Style id="flightPath">
      <LineStyle>
        <color>${lineColor}</color>
        <width>${lineWidth}</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>Flight Path</name>
      <styleUrl>#flightPath</styleUrl>
      <LineString>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
            ${coordinates}
        </coordinates>
      </LineString>
    </Placemark>
${placemarks}
  </Document>
</kml>`;
  }

  private buildPlacemarks(states: FlightState[], _options: KMLExportOptions): string {
    const marks: string[] = [];

    // Start/end markers
    if (states.length > 0) {
      const first = states[0];
      const last = states[states.length - 1];
      marks.push(this.pointPlacemark("Start", first, "Start of track"));
      marks.push(this.pointPlacemark("End", last, "End of track"));
    }

    return marks.join("\n");
  }

  private pointPlacemark(name: string, state: FlightState, desc: string): string {
    const altFt = Math.round(state.position.altitude * 3.28084);
    const gsKts = Math.round(state.velocity.groundSpeed * 1.94384);
    return `    <Placemark>
      <name>${this.escapeXml(name)}</name>
      <description>${this.escapeXml(desc)} - ${altFt}ft, ${gsKts}kts</description>
      <Point>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>${state.position.longitude},${state.position.latitude},${state.position.altitude}</coordinates>
      </Point>
    </Placemark>`;
  }

  private escapeXml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
}
