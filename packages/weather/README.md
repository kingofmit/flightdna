# @flightdna/weather

NOAA weather client and atmospheric model for the FlightDNA framework. Provides METAR/TAF data, ISA calculations, and atmospheric conditions at any altitude.

## Installation

```bash
npm install @flightdna/weather
```

## Usage

```ts
import { ISACalculator, NOAAClient } from "@flightdna/weather";

// International Standard Atmosphere at 10,000m
const isa = new ISACalculator();
const atmo = isa.calculate(10000);
console.log(atmo.temperature); // ~223.15 K (-50 C)
console.log(atmo.density);     // ~0.414 kg/m^3

// Fetch METAR for an airport
const noaa = new NOAAClient();
const metar = await noaa.getMetar("KJFK");
```

## License

[MIT](../../LICENSE)
