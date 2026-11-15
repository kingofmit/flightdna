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
date: 14 November 2026
bibliography: paper.bib
---

# Summary

FlightDNA is an open-source framework for constructing real-time digital twins of aircraft using publicly available Automatic Dependent Surveillance-Broadcast (ADS-B) data. The framework ingests live aircraft state vectors from the OpenSky Network, enriches them with atmospheric data from NOAA weather services, and applies six-degree-of-freedom (6-DOF) flight dynamics models to reconstruct aircraft performance parameters that are not directly observable from surveillance data alone — including aerodynamic coefficients, fuel burn rates, engine health indicators, and structural fatigue accumulation.

The framework is implemented in TypeScript as a modular monorepo comprising seven packages: `core` (orchestration and types), `adsb` (Mode S decoding and OpenSky API client), `weather` (atmospheric modeling and NOAA integration), `dynamics` (flight dynamics and performance estimation), `twin` (Kalman-filter-based state estimation, health monitoring, and anomaly detection), `fleet` (multi-aircraft tracking and fleet analytics), and `export` (data output in CSV, JSON, GeoJSON, and flight data recorder formats).

# Statement of Need

Aircraft digital twins — virtual representations that mirror the state and behavior of physical aircraft in real time — are increasingly recognized as essential tools for predictive maintenance, fleet management, and aviation safety research [@GlaessgenStargel2012; @Tuegel2011]. However, existing digital twin implementations are proprietary systems operated by airlines and OEMs (e.g., GE Predix, Airbus Skywise), making them inaccessible to academic researchers, independent analysts, and smaller operators.

Meanwhile, the proliferation of ADS-B receivers and open data platforms such as the OpenSky Network [@Schafer2014] has created an unprecedented public dataset of global aircraft movements — over 30 trillion position reports covering tens of thousands of aircraft. Despite this wealth of data, there is no open-source framework that transforms raw ADS-B surveillance into meaningful aircraft performance analytics.

Researchers studying fleet-wide fuel efficiency, atmospheric turbulence effects, or maintenance patterns must currently either negotiate data-sharing agreements with airlines, build custom analysis pipelines from scratch, or rely on simulated data that may not reflect real-world conditions. FlightDNA addresses this gap by providing a modular, extensible framework that bridges the distance between raw surveillance data and actionable aircraft intelligence.

The framework is designed for three primary audiences:

1. **Aviation researchers** who need real-world aircraft performance data for studies in aerodynamics, atmospheric science, or fleet operations.
2. **Engineering educators** who require interactive, data-driven tools for teaching flight dynamics, aircraft performance, and systems engineering.
3. **Independent analysts and smaller operators** who lack access to proprietary digital twin platforms but need aircraft monitoring capabilities.

# Architecture

FlightDNA implements a data pipeline architecture with four stages:

1. **Ingest**: ADS-B messages are decoded from Mode S format or retrieved via the OpenSky Network REST API. The `@flightdna/adsb` package implements CPR (Compact Position Reporting) decoding for airborne and surface positions, velocity extraction from airborne velocity messages, and aircraft identification from identification messages.

2. **Enrich**: Raw positional data is augmented with atmospheric conditions from the `@flightdna/weather` package, which combines International Standard Atmosphere (ISA) calculations with real-time METAR and TAF observations from NOAA. The atmospheric model accounts for temperature, pressure, density, wind, and viscosity at the aircraft's altitude and position.

3. **Model**: The `@flightdna/dynamics` package applies 6-DOF flight dynamics equations to estimate aerodynamic forces and performance metrics. A least-squares drag polar estimator reconstructs the aircraft's drag characteristics from observed trajectory data, enabling calculation of fuel burn, rate of climb capability, and range performance without requiring proprietary aircraft data.

4. **Twin**: The `@flightdna/twin` package fuses ADS-B observations with the dynamics model predictions using a Kalman filter, producing a smoothed, continuous aircraft state estimate. Health monitoring algorithms track engine performance degradation, structural fatigue accumulation, and fuel system efficiency over time. An anomaly detector using Welford's online algorithm identifies deviations from expected performance envelopes.

# Key Features

- **Mode S ADS-B Decoder**: Full implementation of airborne position (CPR), velocity, and identification message decoding.
- **6-DOF Flight Dynamics**: Force and moment computation, state propagation, and performance envelope calculation.
- **Drag Polar Estimation**: Least-squares regression of drag coefficients from observed flight data, with Oswald efficiency factor estimation.
- **Kalman Filter State Estimation**: Six-state filter fusing position and velocity observations with dynamics model predictions.
- **Health Monitoring**: Tracking of engine performance ratio, structural fatigue cycles, fuel efficiency trends, and navigation accuracy.
- **Anomaly Detection**: Real-time identification of speed, altitude, vertical rate, and position anomalies using statistical methods.
- **Fleet Analytics**: Multi-aircraft tracking with comparative analysis across aircraft of the same type.
- **Multi-Format Export**: CSV, JSON, GeoJSON (points and trajectories), and flight data recorder (FDR) format output.

# Acknowledgements

The author acknowledges the OpenSky Network for providing open access to ADS-B surveillance data, and NOAA for public atmospheric data services.

# References
