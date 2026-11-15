# @flightdna/dynamics

6-DOF flight dynamics model, aerodynamic coefficient estimation, and performance metrics for the FlightDNA framework.

## Installation

```bash
npm install @flightdna/dynamics
```

## Usage

```ts
import { FlightDynamicsModel, DragPolarEstimator } from "@flightdna/dynamics";

// Estimate drag polar from observed flight data
const estimator = new DragPolarEstimator();
estimator.addObservation({ cl: 0.5, cd: 0.035, mach: 0.78 });
const polar = estimator.estimate();

// Calculate performance metrics
const model = new FlightDynamicsModel({ mass: 70000, wingArea: 122.6 });
const metrics = model.calculatePerformance({
  altitude: 10000,
  mach: 0.78,
  density: 0.414,
  dragPolar: polar,
});
```

## License

[MIT](../../LICENSE)
