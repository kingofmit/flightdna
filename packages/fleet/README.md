# @flightdna/fleet

Fleet management, comparative analytics, and route analysis for the FlightDNA framework.

## Installation

```bash
npm install @flightdna/fleet
```

## Usage

```ts
import { FleetManager } from "@flightdna/fleet";

const fleet = new FleetManager();

// Add aircraft to the fleet
fleet.addAircraft("a1b2c3", { typeDesignator: "B738" });
fleet.addAircraft("d4e5f6", { typeDesignator: "B738" });

// Get fleet-wide analytics
const analytics = fleet.getAnalytics();
console.log(analytics.averageHealth);
console.log(analytics.aircraftCount);

// Compare two aircraft of the same type
const comparison = fleet.compare("a1b2c3", "d4e5f6");
```

## License

[MIT](../../LICENSE)
