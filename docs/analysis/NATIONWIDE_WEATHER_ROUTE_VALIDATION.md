# Nationwide Weather And Route Validation

Date: 2026-09-13
Result: Accepted
Scope: 50 states and the District of Columbia

## Validation Design

The audit reuses one origin/destination pair from each jurisdiction's accepted Stage 10 route
fixtures. Fixture loading fails on a missing jurisdiction, duplicate state fixture, malformed
coordinate, or representative point outside the Census state bounds.

Two independent live gates were run:

1. NWS current and hourly forecast normalization for one representative point per jurisdiction.
2. End-to-end managed walking comparison through Mapbox, the R2-backed building query service,
   NWS, Snow analysis, and Comfort reranking.

The results establish representative nationwide integration. They do not establish that every
address, trail, sidewalk, microclimate, or NWS forecast office has been exhaustively tested.

## NWS Results

| Check | Result |
| --- | --- |
| Jurisdictions | 51/51 passed |
| Total hourly forecast points | 7,956 |
| Minimum forecast points per jurisdiction | 156 |
| Routing forecast horizon | 24 hours |
| Minimum 24-hour snowfall coverage | 100% |
| Minimum 24-hour ice-accumulation coverage | 100% |
| Minimum 24-hour precipitation-type coverage | 100% |
| Minimum 24-hour usable wind-vector coverage | 100% |
| Failed jurisdictions | 0 |

NWS offices do not all publish snow and ice grids for the same long-range horizon. Across the
full 156 hourly periods, minimum snow/ice coverage was 44.23%, or 69 hourly points. The product
does not fill later missing values with zero. A departure outside the available grid remains
partial and cannot win a Snow Comfort comparison.

## Managed Route Results

| Check | Result |
| --- | --- |
| Jurisdictions | 51/51 passed |
| Routing provider | Mapbox Directions API v5, managed production mode |
| Building provider | Authenticated R2-backed building query service |
| Overture release | `2026-08-19.0` in all 51 responses |
| Managed routing requests | 153 |
| Analyzed route candidates | 97 |
| Comparable route candidates | 97 |
| Average comparison latency | 2,786 ms |
| Maximum comparison latency | 5,277 ms |
| Failed jurisdictions | 0 |

Every analyzed candidate included Snow analysis. No public OSRM fallback was permitted by the
configured provider contract.

## Overture Archive Audit

| Check | Result |
| --- | --- |
| Jurisdictions archived and remotely verified | 51/51 |
| Planned and completed partitions | 20,758/20,758 |
| Invalid partitions | 0 |
| Buildings | 186,043,651 |
| Usable-height ratio | 73.54% |
| Archived bytes | 99,541,442,479 |

The archive audit validates manifests and checked-in remote-verification checkpoints. It is
separate from the live query-service checks above.

## Code Quality Gates

- Deterministic and integration tests: 277/277 passed.
- TypeScript typecheck: passed.
- ESLint: passed.
- Production build: passed.
- `git diff --check`: passed.

## Evidence

The detailed machine-readable reports for this run were written to:

```text
/tmp/comfortos-nationwide-weather-validation.json
/tmp/comfortos-nationwide-integration-validation.json
/tmp/comfortos-nationwide-overture-audit.json
```

The validators are repeatable through `weather:validate:nationwide`,
`routes:validate:nationwide`, and `data:buildings:audit`.

## Remaining Limits

- The September run did not observe an active snowstorm in every jurisdiction.
- Snow Comfort still does not know plowing, observed sidewalk ice, pavement accessibility, or
  safe travel conditions.
- Terrain grade is not active in route cost.
- Representative route success is not exhaustive street-level coverage.
