# Stage 5.6 Real Data Audit

Date: 2026-08-10

## Scope

This audit validates production data boundaries after Stage 5.5. It does not begin Stage 6 custom routing.

## Result

```text
Fixture boundary: PASS
Real Overture Minneapolis dataset present: NO
Real Overture pipeline implemented: YES
Ready for Stage 6: NOT READY
```

## Claude Design Fixture Search

Searched for the known design prototype literals:

```text
18°F, 4°F, 48°F, 108°F
42, 51, 58, 61, 66, 74, 33, 36, 44
24-48%, 15-35%, 24-62%, 18-64%
Stay Warm, Stay Dry, Stay Cool
Wind shelter in 300 ft, Covered walkway in 2 min, Shade begins in 2 min
Protected for the next 6 min, Shaded for ~5 min
Bridge Path, Elm St, Garden Walk, CITY_DATA
```

Findings:

- Design fixtures remain in `docs/design/baseline/` and canonical design guidelines.
- Analysis and ADR documents mention the fixtures as historical scope/non-goals.
- Production runtime directories `app/`, `components/`, and `lib/` do not contain those Claude Design fixture literals.
- `CITY_DATA` exists only in design baseline source files.

## Import Trace

No production runtime imports from fixture/design/test paths were found.

Current fixture imports:

```text
fixtures/routes/minneapolis-stage-5-5-routes.json
↓
scripts/benchmark-building-providers.ts
scripts/validate-comfort-routes.ts
scripts/validate-comfort-routes-local.ts
↓
developer validation only
↓
production unreachable
```

No import trace from `fixtures/`, `tests/`, or `docs/design/baseline/` reaches:

```text
app/
components/
lib/
API routes
runtime provider initialization
```

## Automated Safeguards

Added:

```text
eslint.config.mjs
tests/production-data-boundary.test.ts
```

Safeguards:

- `app/`, `components/`, and `lib/` cannot import `fixtures/`, `tests/`, or `docs/design/baseline/`.
- production runtime code is scanned for known Claude Design fixture literals.
- production building provider configuration rejects fixture provider modes and fixture store paths.
- explicit `BUILDING_PROVIDER=local-overture` now requires `BUILDING_LOCAL_OVERTURE_STORE_DIR`.

## UI Claims Audit

| UI Claim | Runtime source | Classification |
| --- | --- | --- |
| Temperature and weather text | `EnvironmentSummary` -> `WeatherBundle` -> `NwsWeatherProvider` | PRODUCTION REAL DATA |
| Wind summary | `EnvironmentSummary` -> `WeatherBundle` -> `NwsWeatherProvider` | PRODUCTION REAL DATA |
| Route ETA and distance | `StageZeroApp` -> `RouteResult` -> `OsrmWalkingProvider` | PRODUCTION REAL DATA |
| `+N min` route tradeoff | Candidate metrics from normalized routes | DETERMINISTIC COMPUTATION |
| `% lower environmental exposure` | `routeComfortCost.environmentalExposureCost` ratio | DETERMINISTIC COMPUTATION |
| Comfort score | `ComfortAnalysisService` display mapping | DETERMINISTIC COMPUTATION |
| Raw comfort cost | `ComfortAnalysisService` | DETERMINISTIC COMPUTATION |
| Shade percentage | `ShadeAnalysisService` from route/buildings/solar | DETERMINISTIC COMPUTATION |
| Shade confidence and meters | `ShadeAnalysisService` quality model | DETERMINISTIC COMPUTATION |
| Wind exposure label | `WindAnalysisService` output label formatting | DETERMINISTIC COMPUTATION |
| Wind exposure m/s, headwind, crosswind | `WindAnalysisService` | DETERMINISTIC COMPUTATION |
| Building debug counts | `BuildingProvider` output summarized in comparison debug | PRODUCTION REAL DATA when real provider is selected |
| `ComfortOS Stage 5` and `Minneapolis` shell labels | Prototype shell copy | FALLBACK / PLACEHOLDER |
| Map center | `MINNEAPOLIS_CENTER` | FALLBACK / PLACEHOLDER prototype scenario |

Static copy such as "Estimated building shade", "Outdoor Comfort", "Estimated wind exposure", "Baseline walking route", and "Limited data" is explanatory and is not a numerical environmental claim.

## Data Source Classification

| Source | Category |
| --- | --- |
| OSRM walking routes | PRODUCTION REAL DATA |
| OSRM alternatives and waypoint route responses | PRODUCTION REAL DATA |
| Corridor waypoint generation | DETERMINISTIC COMPUTATION |
| Photon geocoding | PRODUCTION REAL DATA |
| NWS current weather, forecast, alerts | PRODUCTION REAL DATA |
| Overpass buildings | PRODUCTION REAL DATA |
| Real Overture-derived building store/service | PRODUCTION REAL DATA once generated from official Overture data |
| Stage 5.5 Overture-like sample | DEVELOPMENT FIXTURE |
| Route validation JSON | DEVELOPMENT FIXTURE |
| Test inline buildings/weather/routes | TEST FIXTURE |
| Claude Design `CITY_DATA` and scenario values | DESIGN FIXTURE |
| Minneapolis shell label/map center | FALLBACK / PLACEHOLDER |
| Solar position, shade, wind, comfort, reranking | DETERMINISTIC COMPUTATION |

## Remaining Risks

- Real Overture Minneapolis data has not been downloaded in this environment because the official Overture CLI is not installed.
- The app-worker runtime still needs the selected query-service deployment before local Overture data can be used in production-like browser API requests.
- Active navigation guidance remains absent; future turn-by-turn text must be derived from route progress and segment environment, not design strings.
