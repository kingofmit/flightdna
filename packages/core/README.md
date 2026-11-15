# @flightdna/core

Core types, event emitter, and pipeline orchestrator for the FlightDNA aircraft digital twin framework.

## Installation

```bash
npm install @flightdna/core
```

## Usage

```ts
import { FlightDNA, type Aircraft, type FlightState } from "@flightdna/core";

const dna = new FlightDNA({
  updateInterval: 5000,
  sources: { opensky: true },
});

dna.on("stateUpdate", (state: FlightState) => {
  console.log(state.position, state.velocity);
});

await dna.track("a1b2c3");
```

## License

[MIT](../../LICENSE)
