# @flightdna/export

Export flight data to CSV, JSON, and Parquet formats and generate flight reports for the FlightDNA framework.

## Installation

```bash
npm install @flightdna/export
```

## Usage

```ts
import { CSVExporter, FlightReporter } from "@flightdna/export";

// Export flight states to CSV
const exporter = new CSVExporter();
const csv = exporter.export(flightStates);

// Generate a flight summary report
const reporter = new FlightReporter();
const report = reporter.generateSummary(flightStates);
```

## License

[MIT](../../LICENSE)
