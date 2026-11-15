# Contributing

Thanks for your interest in contributing to FlightDNA.

## Setup

```bash
git clone https://github.com/kingofmit/flightdna.git
cd flightdna
pnpm install
pnpm build
pnpm test
```

Requires Node.js >= 20 and [pnpm](https://pnpm.io/) >= 9.

## Project Structure

```
packages/
  core/        @flightdna/core        Core types and orchestrator
  adsb/        @flightdna/adsb        ADS-B decoder and OpenSky client
  weather/     @flightdna/weather     NOAA weather and atmospheric model
  dynamics/    @flightdna/dynamics    Flight dynamics and aero estimation
  twin/        @flightdna/twin        Digital twin with Kalman filter
  fleet/       @flightdna/fleet       Fleet management and analytics
  export/      @flightdna/export      Export to CSV, JSON, Parquet
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm dev` | Watch mode |
| `pnpm clean` | Remove build artifacts |

## Pull Requests

1. Fork and clone the repo
2. Create a branch from `main`: `git checkout -b feat/my-feature`
3. Make your changes and add tests
4. Run `pnpm build && pnpm test`
5. Create a changeset: `pnpm changeset`
6. Open a PR against `main`

## Conventions

- TypeScript strict mode
- All numerical computations use SI units internally
- Export types alongside implementations
- Document physical constants and formulas with references

## Changesets

We use [Changesets](https://github.com/changesets/changesets) for versioning. Run `pnpm changeset` when making user-facing changes.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
