# @flightdna/adsb

ADS-B message decoder and OpenSky Network API client for the FlightDNA framework.

## Installation

```bash
npm install @flightdna/adsb
```

## Usage

```ts
import { OpenSkyClient, ADSBDecoder } from "@flightdna/adsb";

// Query live aircraft states
const client = new OpenSkyClient();
const states = await client.getStates({ icao24: ["a1b2c3"] });

// Decode raw ADS-B messages
const decoder = new ADSBDecoder();
const message = decoder.decode("8D4840D6202CC371C32CE0576098");
```

## License

[MIT](../../LICENSE)
