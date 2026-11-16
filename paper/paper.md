---
title: 'FlightDNA: An Open Framework for Aircraft Digital Twins Using Public ADS-B Surveillance Data'
tags:
  - aviation
  - digital twin
  - ADS-B
  - aircraft performance
  - predictive maintenance
  - TypeScript
  - flight dynamics
authors:
  - name: Ahmed Allem
    orcid: 0009-0003-4937-5858
    affiliation: 1
affiliations:
  - name: Independent Researcher
    index: 1
date: 16 November 2026
bibliography: paper.bib
---

# Summary

FlightDNA is an open-source framework for constructing real-time digital twins of aircraft using publicly available Automatic Dependent Surveillance-Broadcast (ADS-B) data. The framework ingests live aircraft state vectors from the OpenSky Network or local dump1090/SBS receivers, enriches them with atmospheric data from an International Standard Atmosphere (ISA) model validated against ICAO Doc 7488 [@ICAO7488] and augmented with NOAA weather services, and applies point-mass three-degree-of-freedom (3-DOF) flight dynamics with fourth-order Runge-Kutta (RK4) integration to reconstruct aircraft performance parameters that are not directly observable from surveillance data alone — including aerodynamic coefficients, fuel burn rates, engine health indicators, and structural fatigue accumulation.

The framework is implemented in TypeScript as a modular monorepo comprising seven packages: `core` (orchestration and types), `adsb` (Mode S decoding with CRC-24 validation, OpenSky API client, and dump1090/SBS TCP client), `weather` (ISA atmospheric modeling, wind altitude profiles, and NOAA integration), `dynamics` (3-DOF flight dynamics with parametric thrust modeling, drag polar estimation, Mach-dependent wave drag, and a 50-type aircraft database), `twin` (eight-state extended Kalman filter with coordinated-turn motion model, health monitoring, flight phase detection, and anomaly detection), `fleet` (multi-aircraft tracking and fleet analytics), and `export` (data output in CSV, JSON, GeoJSON, KML, JSONL, and flight data recorder formats).

# Statement of Need

Aircraft digital twins — virtual representations that mirror the state and behavior of physical aircraft in real time — are increasingly recognized as essential tools for predictive maintenance, fleet management, and aviation safety research [@GlaessgenStargel2012; @Tuegel2011]. However, existing digital twin implementations are proprietary systems operated by airlines and OEMs (e.g., GE Predix, Airbus Skywise), making them inaccessible to academic researchers, independent analysts, and smaller operators.

Meanwhile, the proliferation of ADS-B receivers and open data platforms such as the OpenSky Network [@Schafer2014] has created an unprecedented public dataset of global aircraft movements — over 30 trillion position reports covering tens of thousands of aircraft. Despite this wealth of data, there is no open-source framework that transforms raw ADS-B surveillance into meaningful aircraft performance analytics. Tools such as pyModeS [@Sun2019] provide Mode S decoding, and the traffic library [@Olive2019] offers trajectory analysis, but neither provides a unified pipeline from raw messages to a filtered, physics-informed digital twin.

FlightDNA addresses this gap by providing a modular, extensible framework that bridges the distance between raw surveillance data and actionable aircraft intelligence. The framework is designed for three primary audiences:

1. **Aviation researchers** who need real-world aircraft performance data for studies in aerodynamics, atmospheric science, or fleet operations.
2. **Engineering educators** who require interactive, data-driven tools for teaching flight dynamics, aircraft performance, and systems engineering.
3. **Independent analysts and smaller operators** who lack access to proprietary digital twin platforms but need aircraft monitoring capabilities.

# Architecture

FlightDNA implements a data pipeline architecture with four stages:

1. **Ingest**: ADS-B messages are decoded from Mode S format, retrieved via the OpenSky Network REST API, or streamed from local dump1090/SBS receivers over TCP. The `@flightdna/adsb` package implements CRC-24 validation using the Mode S generator polynomial (`0xFFF409`) to reject corrupted messages, Compact Position Reporting (CPR) decoding for airborne and surface positions with a 10-second time-to-live (TTL) for position pair validity, velocity extraction from airborne velocity messages (subtypes 1--4), and aircraft identification from identification messages (type codes 1--4).

2. **Enrich**: Raw positional data is augmented with atmospheric conditions from the `@flightdna/weather` package, which combines an International Standard Atmosphere (ISA) calculator [@ICAO7488] covering the troposphere and lower stratosphere (0--20 km) with real-time METAR and TAF observations from NOAA. The ISA model computes temperature, pressure, density, speed of sound, and dynamic viscosity (via Sutherland's formula) at the aircraft's altitude. A wind altitude model using power-law scaling with Ekman spiral correction estimates wind variation with height.

3. **Model**: The `@flightdna/dynamics` package applies point-mass 3-DOF flight dynamics equations with RK4 numerical integration to estimate aerodynamic forces and performance metrics. A least-squares drag polar estimator reconstructs the aircraft's drag characteristics ($C_D = C_{D_0} + k C_L^2$) from observed trajectory data, comparable to approaches in OpenAP [@Sun2020openap], with Mach-dependent wave drag correction via Lock's formula. Parametric thrust models for turbofan, turboprop, and piston engines provide altitude- and speed-dependent thrust estimates. A built-in database of 50 aircraft types provides wing area, mass, thrust, and estimated drag polar parameters sourced from public manufacturer specifications. Mass estimation from trajectory data follows the general approach described by @Alligier2015.

4. **Twin**: The `@flightdna/twin` package fuses ADS-B observations with the dynamics model predictions using an eight-state extended Kalman filter [@Kalman1960] with a coordinated-turn motion model. The state vector comprises latitude, longitude, altitude, north velocity, east velocity, down velocity, heading, and turn rate. The filter uses Joseph-form covariance updates for numerical stability and supports innovation-based adaptive process noise estimation. A flight phase detector classifies the current flight phase (ground, takeoff, climb, cruise, descent, approach, landing) using hysteresis-based state transitions to suppress noisy phase changes. Health monitoring algorithms track engine performance degradation, structural fatigue accumulation, and fuel system efficiency over time. An anomaly detector using Welford's online algorithm [@Welford1962] identifies deviations from expected performance envelopes.

# Key Features

- **Mode S ADS-B Decoder**: Full DF17/DF18 implementation with CRC-24 validation, CPR global position decoding with configurable TTL, airborne velocity decomposition, aircraft identification, and surface position decoding.
- **ISA Atmosphere Model**: ICAO Doc 7488 standard atmosphere from sea level to 20 km (troposphere and lower stratosphere), with Sutherland viscosity, pressure altitude, and density altitude calculations.
- **Point-Mass 3-DOF Flight Dynamics**: Aerodynamic force computation, RK4 state propagation, body-to-NED coordinate transformation, thrust-required estimation, specific excess power, rate-of-climb calculation, and Mach-dependent wave drag correction (Lock's formula).
- **Drag Polar Estimation**: Ordinary least squares regression of $C_{D_0}$ and induced drag factor $k$ from observed flight data, with Oswald efficiency factor and maximum lift-to-drag ratio derivation.
- **50-Type Aircraft Database**: Performance parameters (wing area, span, MTOW, OEW, thrust, estimated drag polar) for 50 common aircraft types spanning narrowbody, widebody, regional, turboprop, business jet, cargo, and military categories.
- **Eight-State Extended Kalman Filter**: Coordinated-turn motion model fusing position and velocity observations with dynamics predictions. Joseph-form covariance update and innovation-based adaptive noise estimation.
- **Flight Phase Detection**: Real-time classification of flight phases (ground, takeoff, climb, cruise, descent, approach, landing) with hysteresis-based state transitions.
- **Health Monitoring**: Tracking of engine performance ratio, structural fatigue cycles, fuel efficiency trends, and navigation accuracy.
- **Anomaly Detection**: Real-time identification of speed, altitude, vertical rate, and position anomalies using Welford's online statistical method.
- **Fleet Analytics**: Multi-aircraft tracking with comparative analysis across aircraft of the same type.
- **Multi-Format Export**: CSV, JSON, GeoJSON (points and trajectories), KML, JSONL, and flight data recorder (FDR) format output.

# Example Usage

FlightDNA can be used programmatically or via its command-line interface:

```typescript
import { OpenSkyClient } from "@flightdna/adsb";
import { DigitalTwin } from "@flightdna/twin";

const client = new OpenSkyClient();
const twin = new DigitalTwin({ icao24: "a835af" });

const states = await client.getStates({ icao24: ["a835af"] });
twin.update(states[0]);

const state = twin.getState();
// state.position, state.velocity, state.performance,
// state.health, state.anomalies, state.flightPhase
```

The framework also includes two demonstration applications: a real-time dashboard with WebSocket-based aircraft tracking and an interactive flight analyzer with CSV import and performance visualization.

# Validation

FlightDNA includes a comprehensive test suite of 246 unit and integration tests covering all seven packages. Key validation results:

**ISA Atmosphere Model**: Temperature, pressure, and density calculations validated against ICAO Doc 7488 standard atmosphere tables at seven reference altitudes (0--20,000 m), with agreement within 0.5% for temperature and 1% for pressure and density.

**ADS-B Decoder**: Message decoding verified against known test vectors for DF17 identification (TC 1--4), airborne position (TC 9--18), and airborne velocity (TC 19) messages. CRC-24 validation using the Mode S generator polynomial (`0xFFF409`) rejects corrupted messages.

**Drag Polar Estimation**: Ordinary least squares regression recovers synthetic drag polar parameters ($C_{D_0}$, $k$) from noisy observations with $R^2 > 0.95$. Estimated Oswald efficiency factors for transport aircraft fall within the expected 0.7--0.9 range.

**Kalman Filter**: The extended Kalman filter with coordinated-turn motion model produces filtered trajectory estimates with lower root-mean-square position error than raw ADS-B measurements on synthetic constant-velocity trajectories.

**Anomaly Detection**: Statistical anomaly detection correctly identifies injected speed deviations (>3$\sigma$), position jumps, and extreme vertical rates (>30 m/s) with zero false positives during 50-sample steady-state operation.

# Acknowledgements

The author acknowledges the OpenSky Network for providing open access to ADS-B surveillance data, and NOAA for public atmospheric data services.

# References
