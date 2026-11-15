# @flightdna/twin

Aircraft digital twin with Kalman filter state estimation, health monitoring, and anomaly detection for the FlightDNA framework.

## Installation

```bash
npm install @flightdna/twin
```

## Usage

```ts
import { DigitalTwin } from "@flightdna/twin";

const twin = new DigitalTwin({ icao24: "a1b2c3" });

// Feed ADS-B state updates
twin.update(flightState);

// Get fused state estimate
const state = twin.getState();
console.log(state.position);
console.log(state.health);
console.log(state.anomalies);
```

## License

[MIT](../../LICENSE)
