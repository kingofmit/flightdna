# @flightdna/fleet

## 0.3.0

### Minor Changes

- v0.3.0: Post-publication feature release

  - GFS 4D wind data ingestion from NOAA NOMADS with pressure-level interpolation
  - ML-based anomaly detection using online autoencoder (no external dependencies)
  - Database persistence abstraction with MemoryStorage and PostgreSQL/TimescaleDB schema
  - Aircraft noise modeling (simplified INM: SEL, Lmax, EPNL, contour generation)
  - Turbulence detection from ADS-B vertical rate variance (EDR estimation)
  - Columnar data export with TypedArray format and NDJSON for big data pipelines
  - Airspace awareness: 53 zones (TMA, CTR, restricted), classification lookup
  - 337 tests passing across all packages

### Patch Changes

- Updated dependencies
  - @flightdna/core@0.3.0
  - @flightdna/twin@0.3.0

## 0.2.0

### Minor Changes

- Initial production release of FlightDNA aircraft digital twin framework.

  - Full ADS-B pipeline: CRC-24 decoder, OpenSky REST client, dump1090/SBS TCP client
  - ISA atmosphere model with NOAA METAR blending and wind altitude profiles
  - Point-mass 3-DOF dynamics with RK4, drag polar estimation, parametric thrust, 50-type aircraft database
  - 8-state Extended Kalman Filter with coordinated-turn model and adaptive noise
  - Flight phase detection, health monitoring, anomaly detection
  - Fleet analytics with 200-airport database, route detection, type baselines
  - Export: CSV, JSON, GeoJSON, KML, JSONL, FDR formats
  - 246 unit tests, ESLint, TypeDoc, CI pipeline

### Patch Changes

- Updated dependencies
  - @flightdna/core@0.2.0
  - @flightdna/twin@0.2.0
