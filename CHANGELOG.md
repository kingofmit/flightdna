# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-11-14

### Added
- GFS wind data integration (`@flightdna/weather`)
- ML-based anomaly detection for digital twins
- Database persistence layer
- Environmental noise modeling

### Fixed
- Dashboard map tiles: switched from CARTO (requires API key) to Stadia Maps (free)
- OpenSky API response parsing: handle positional array format from REST endpoint

## [0.2.0] - 2026-10-28

### Added
- Turbulence detection module
- Columnar data export (Parquet-style)
- Airspace awareness and boundary detection (`@flightdna/fleet`)
- Real-data validation script for live OpenSky testing

### Changed
- Bumped all packages to v0.2.0
- Fixed CI pnpm version conflict

## [0.1.0] - 2026-10-15

### Added
- Initial release: open aircraft digital twin framework
- Core 3-DOF flight dynamics with EKF state estimation (`@flightdna/core`)
- OpenSky Network ADS-B client (`@flightdna/adsb`)
- ISA atmosphere and weather integration (`@flightdna/weather`)
- Digital twin engine with health scoring (`@flightdna/twin`)
- Fleet management and analytics (`@flightdna/fleet`)
- Data export in CSV/JSON formats (`@flightdna/export`)
- Live dashboard with Leaflet map and WebSocket updates
- Historical flight analyzer with CSV upload
- CLI tool for batch processing
- JOSS paper draft
- Full test suite (246 tests)
