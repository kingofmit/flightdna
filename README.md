<p align="center">
  <img src=".github/FlightDNA.png" alt="FlightDNA" />
</p>

# FlightDNA

**Open framework for aircraft digital twins using public ADS-B surveillance data.**

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.24243284.svg)](https://doi.org/10.5281/zenodo.24243284)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-brightgreen.svg)](https://nodejs.org/)

FlightDNA reconstructs real-time aircraft performance from publicly available ADS-B data. It combines Mode S message decoding, atmospheric modeling, flight dynamics, and Kalman-filtered state estimation into a unified digital twin framework — something no other open-source tool provides.

## What Makes FlightDNA Different

| Feature | pyModeS | traffic | OpenAP | FlightDNA |
|---------|:-------:|:-------:|:------:|:---------:|
| ADS-B Decoding | ✓ | — | — | ✓ |
| Trajectory Analysis | — | ✓ | — | ✓ |
| Performance Model | — | — | ✓ | ✓ |
| Real-time Digital Twin | — | — | — | ✓ |
| Weather Integration | — | — | — | ✓ |
| Anomaly Detection | — | — | — | ✓ |
| Fleet Analytics | — | — | — | ✓ |
| TypeScript / Browser | — | — | — | ✓ |

## Quick Start

### Installation

```bash
npm install @flightdna/core @flightdna/adsb @flightdna/twin
```

### Track an Aircraft

```typescript
import { OpenSkyClient } from "@flightdna/adsb";
import { DigitalTwin } from "@flightdna/twin";

const client = new OpenSkyClient();
const twin = new DigitalTwin({ icao24: "a835af" });

const states = await client.getStates({ icao24: ["a835af"] });
if (states.length > 0) {
  twin.update(states[0]);

  const state = twin.getState();
  console.log(`Position: ${state.position.latitude}, ${state.position.longitude}`);
  console.log(`Altitude: ${Math.round(state.position.altitude * 3.28084)} ft`);
  console.log(`Speed: ${Math.round(state.velocity.groundSpeed * 1.94384)} kts`);
  console.log(`Phase: ${state.flightPhase}`);
  console.log(`Health: ${((state.health.find(h => h.type === "overall")?.value ?? 1) * 100).toFixed(0)}%`);
}
```

### Full Pipeline

```typescript
import { FlightDNA } from "@flightdna/core";
import { OpenSkyClient } from "@flightdna/adsb";
import { FleetManager } from "@flightdna/fleet";

const adsb = new OpenSkyClient();
const fleet = new FleetManager("my-fleet");

const dna = new FlightDNA({
  updateInterval: 15_000,
  autoTrack: true,
  pipeline: {
    fetch: (tracked) => adsb.getStates({ icao24: tracked }),
    updateTwin: (icao24, state) => fleet.update(state),
  },
});

dna.on("stateUpdate", (state) => {
  console.log(`${state.aircraft.icao24}: ${state.position.altitude}m`);
});

dna.on("anomaly", (anomaly) => {
  console.log(`ANOMALY: ${anomaly.message}`);
});

dna.start();
```

### Drag Polar Estimation

```typescript
import { DragPolarEstimator } from "@flightdna/dynamics";

const estimator = new DragPolarEstimator();

// Feed observed CL/CD pairs from trajectory analysis
estimator.addObservation({ cl: 0.45, cd: 0.0325, mach: 0.78 });
estimator.addObservation({ cl: 0.50, cd: 0.0345, mach: 0.78 });
estimator.addObservation({ cl: 0.55, cd: 0.0372, mach: 0.78 });
// ... more observations

const polar = estimator.estimate(9.4); // aspect ratio
if (polar) {
  console.log(`CD0: ${polar.cd0.toFixed(4)}`);
  console.log(`k: ${polar.k.toFixed(4)}`);
  console.log(`Oswald efficiency: ${polar.oswald.toFixed(3)}`);
  console.log(`Max L/D: ${estimator.maxLiftToDrag(polar).toFixed(1)}`);
}
```

### CLI

```bash
# Track an aircraft in real-time
npx @flightdna/cli track a835af

# Analyze historical flight data
npx @flightdna/cli analyze flight.csv --output result.geojson --format geojson

# Snapshot all aircraft in a region
npx @flightdna/cli snapshot --bounds 45,55,-5,15
```

## Architecture

```
Raw ADS-B Data ──► Decode ──► Weather Enrich ──► Dynamics ──► Kalman Filter ──► Digital Twin
                   (CRC-24)    (ISA + METAR)      (3-DOF)     (8-state EKF)        │
                                                                                    ▼
                                                                     Health Monitoring
                                                                     Anomaly Detection
                                                                     Flight Phase ID
                                                                            │
                                                                            ▼
                                                              Fleet Analytics ──► Export
                                                                         (CSV/JSON/GeoJSON/FDR)
```

Each package is independently usable. Use `@flightdna/adsb` alone for ADS-B decoding, or `@flightdna/dynamics` standalone for flight dynamics calculations.

## Packages

| Package | Description |
|---------|-------------|
| [`@flightdna/core`](packages/core) | Event bus, types, pipeline orchestrator |
| [`@flightdna/adsb`](packages/adsb) | Mode S decoder with CRC-24, OpenSky API client, CPR position decoding |
| [`@flightdna/weather`](packages/weather) | ISA atmosphere (ICAO Doc 7488), NOAA METAR client, atmospheric blending |
| [`@flightdna/dynamics`](packages/dynamics) | Point-mass 3-DOF with RK4, drag polar estimation, 50-type aircraft database |
| [`@flightdna/twin`](packages/twin) | Extended Kalman filter (8-state coordinated turn), health monitoring, anomaly detection, flight phase |
| [`@flightdna/fleet`](packages/fleet) | Fleet management, comparative analytics |
| [`@flightdna/export`](packages/export) | CSV, JSON, GeoJSON, FDR export, flight reporting |

## Key Algorithms

### Extended Kalman Filter
8-state coordinated-turn model: `[lat, lon, alt, vN, vE, vD, heading, turnRate]`. Handles straight flight and turns in one motion model. Joseph-form covariance update for numerical stability. Innovation-based adaptive process noise.

### Drag Polar Estimation
Estimates `CD = CD₀ + k·CL²` from observed trajectory data using ordinary least squares regression. Derives Oswald efficiency factor, maximum L/D ratio, and minimum drag speed — all from free public ADS-B data.

### ADS-B Decoding
Full Mode S decoder: DF17/18 with CRC-24 validation (polynomial `0xFFF409`), CPR global position decoding with 10-second TTL per ICAO Annex 10 Vol IV, velocity decomposition from EW/NS components.

### ISA Atmosphere
ICAO Doc 7488 standard atmosphere (troposphere + stratosphere) with Sutherland viscosity. Blended with real METAR observations from nearest station within 200 km.

### Point-Mass Dynamics
3-DOF flight dynamics with 4th-order Runge-Kutta integration. Body-to-NED coordinate transformation. Breguet range equation, specific excess power, Carson's speed.

## Data Sources

- **[OpenSky Network](https://opensky-network.org)** — Free real-time and historical ADS-B surveillance data
- **[NOAA Aviation Weather Center](https://aviationweather.gov)** — METAR observations and TAF forecasts

## Development

```bash
git clone https://github.com/kingofmit/flightdna.git
cd flightdna
pnpm install
pnpm build
pnpm test    # 337 tests across 7 packages
```

## Citation

If you use FlightDNA in academic work, please cite:

```bibtex
@article{allem2026flightdna,
  title={{FlightDNA}: An Open Framework for Aircraft Digital Twins
         Using Public {ADS-B} Surveillance Data},
  author={Allem, Ahmed},
  journal={Journal of Open Source Software},
  year={2026}
}
```

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) — Ahmed Allem
