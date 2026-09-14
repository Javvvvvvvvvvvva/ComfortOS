# ADR-032 — Snow And Ice Comfort Routing

Date: 2026-09-13
Status: Accepted

## Context

Ahhway previously treated winter only as cold and wind exposure. That could not distinguish
active snowfall, freezing rain, or known-zero winter precipitation, and it could not reward a
route with route-accessible overhead cover during snowfall. The architecture specification
also describes future snow clearing and reduced ice risk, but no nationwide production source
currently proves sidewalk plowing, observed surface ice, accessibility, or safe grades.

## Decision

Add a deterministic Snow/Ice Engine under `lib/environment/snow/` and a normalized
precipitation-type classifier under `lib/weather/`. The engine consumes only normalized
`WeatherBundle`, route timing, `WindAnalysisResult`, and access-aware covered features. It does
not call NWS, environment providers, routing providers, or React directly.

NWS digital-grid amounts are converted using their actual ISO 8601 valid interval:

```text
rateMmPerHour = accumulationMm / validIntervalHours
```

The v1 route-exposure model is:

```text
snowfallFactor = clamp(snowfallMmPerHour / 12.5)
iceFactor = clamp(iceAccumulationMmPerHour / 0.25)
windFactor = min(1.5, 1 + 0.5 * clamp(pedestrianWindMps / 10))

snowfallExposure = snowfallFactor * conservativeUncoveredRatio * windFactor
iceExposure = iceFactor
```

Known public pedestrian cover reduces active snowfall exposure. Unknown cover is scored
conservatively as exposed and lowers confidence/completeness. Ice exposure is not reduced by
overhead cover because v1 has no observed pavement condition.

The Snow Comfort profile combines cold, estimated pedestrian Wind Chill, wind/headwind,
bounded winter sun benefit, snowfall exposure, ice exposure, and walking duration. Raw
environmental cost remains the reranking value; the display score cannot select a route.

Snow routing activates only when active snowfall or ice is detected and all candidate analyses
have comparable snow, weather, and wind coverage. Otherwise routing falls back to cold or
balanced behavior. Frozen precipitation is not also evaluated as liquid rain.

The consumer label is `Snow Comfort`, not `Snow Safe`. Product copy and debug output must state
that the feature does not claim plowed, ice-free, accessible, or safe pavement. Terrain grade is
not an active input in v1.

Versions are:

```text
nws-si-v3.0.0
snow-v1.0.0
comfort-v3.0.0
```

Future coefficient or formula changes require new model versions and regression evidence.

## Validation

- Controlled tests prove known-zero snow and ice yield zero winter exposure.
- Full overhead cover materially lowers active snowfall exposure.
- Stronger pedestrian wind increases active snowfall exposure.
- Overhead cover does not erase ice exposure.
- Missing snowfall/ice rates produce a partial, non-comparable score.
- Context tests prove Snow Comfort is capability-gated and frozen precipitation is not
  double-counted as rain.
- The full deterministic suite passes 277/277 tests.
- Live NWS validation passes one existing Stage 10 route point in all 50 states and the
  District of Columbia. All 51 points returned 156 hourly periods; the first 24 hours had
  100% snowfall, ice-accumulation, precipitation-type, and usable-wind-vector coverage.
- A live end-to-end route comparison passes 51/51 representative jurisdictions through
  managed Mapbox walking, the R2-backed building query service, NWS, Snow analysis, and
  Comfort reranking. All 97 analyzed candidates were comparable.

## Consequences

Ahhway can now rerank existing walking candidates for active winter precipitation without
pretending to know the sidewalk surface. Snow Comfort is useful for relative exposure, while
snow-clearing feeds, observed surface state, terrain grade, and field calibration remain
separate future capabilities.

## References

- [NWS API Web Service](https://www.weather.gov/documentation/services-web-api)
- [NDFD element definitions](https://digital.weather.gov/staticpages/definitions.php)
- [NDFD metadata](https://www.weather.gov/gis/ndfd_metadata.html)
