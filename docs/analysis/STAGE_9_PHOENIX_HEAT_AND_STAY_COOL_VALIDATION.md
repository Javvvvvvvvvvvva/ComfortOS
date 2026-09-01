# Stage 9 — Phoenix Heat And Stay Cool Validation

Date: 2026-08-16

## Conclusion

HEAT ENGINE IMPLEMENTED; PHOENIX BUILDING DATA INGESTED; LIVE ROUTE VALIDATION PARTIAL DUE EXTERNAL OSRM OUTAGE.

Stage 9 successfully adds Phoenix as a third real Overture building region, adds a deterministic Heat Engine, wires `heat` / `Stay Cool` into route comparison, and validates live Phoenix reranking on the first 9 successful OSRM routes before the public routing endpoint became unreachable.

Controlled heat scenarios are implemented under research-only fixtures, but route-level controlled validation could not complete after OSRM began returning fetch/connect failures. Deterministic Heat Engine tests cover the controlled formula behavior.

## Scope

Implemented:

- `config/data-regions/phoenix.json`
- Phoenix real Overture building store
- Heat Engine under `lib/environment/heat/`
- heat-aware `ComfortAnalysisService`
- `heat` / `Stay Cool` contextual routing
- route candidate heat metrics and debug payloads
- `?debug=heat` and `?debug=environment` heat map overlays
- Phoenix general and shade-rich validation route configs
- research-only heat scenarios:
  - `HEAT_EXTREME_SUN`
  - `HEAT_HOT_SUN`
  - `HEAT_HOT_LATE_DAY`
  - `HEAT_HOT_NIGHT`

Not implemented:

- custom heat A*
- tree canopy
- measured solar radiation
- WBGT
- medical heat-risk scoring
- city-specific routing code

## Source Semantics

NWS Heat Index / apparent temperature semantics were audited before implementation:

- NWS/WPC Heat Index uses the Rothfusz regression and is only meaningful in warm ranges. Source: https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml?os=app
- NWS defines Heat Index / apparent temperature as combining relative humidity with actual air temperature. Source: https://forecast.weather.gov/glossary.php?word=HEAT+INDEX
- NWS heat guidance states Heat Index values are devised for shady, light-wind conditions, and direct sun can increase apparent heat stress. Source: https://www.weather.gov/lwx/heat
- NWS WBGT guidance distinguishes WBGT from Heat Index because WBGT includes sun angle, cloud cover, wind, humidity, and sun exposure. Source: https://www.weather.gov/ict/WBGT

Stage 9 therefore does not treat NWS apparent temperature as a complete direct-sun exposure value. ComfortOS models direct sun separately from estimated building shade and solar elevation.

## Heat Engine

Heat Engine inputs:

```text
WeatherBundle
+ route geometry and duration
+ ShadeAnalysisResult
+ WindAnalysisResult
```

Heat Engine output:

```ts
RouteHeatSummary = {
  analyzedMeters,
  unknownMeters,
  averageHeatExposure,
  totalHeatExposureCost,
  ambientHeatExposure,
  solarExposure,
  ventilationModifier,
  shadeRatio,
  directSunRatio,
  longestContinuousSunMeters,
  longestContinuousSunSeconds,
  sunnyRunCount,
  confidence,
  completeness
}
```

Formula:

```text
ambient heat
+ humidity modifier
+ solar/direct-sun exposure
- bounded ventilation modifier
```

Important constraints:

- Missing shade lowers confidence/completeness.
- Missing wind does not become ideal cooling; ventilation modifier becomes neutral.
- Night direct-sun cost is zero.
- Night ambient heat remains.
- Ventilation benefit is bounded and reduced at severe/extreme heat.
- Consumer copy uses “estimated heat exposure” and “estimated building shade.”

## Phoenix Building Data

Region:

```json
{
  "id": "phoenix",
  "bbox": [-112.115, 33.425, -112.045, 33.535]
}
```

Ingestion command:

```text
npm run data:buildings:phoenix -- --output /tmp/comfortos-overture-phoenix-store --release 2026-06-17.0
```

The extractor attempted the documented Overture STAC root. During validation, `https://stac.overturemaps.org/catalog.json` returned unavailable/404-style S3 responses, so the extractor used DuckDB parquet metadata against the official public Overture release glob to identify the intersecting asset. No fixture fallback was used.

Phoenix store:

| Metric | Value |
| --- | ---: |
| Overture release | `2026-06-17.0` |
| BBox | `[-112.115, 33.425, -112.045, 33.535]` |
| Intersecting GeoParquet assets | 1 |
| Building count | 51,737 |
| Explicit height count | 50,401 |
| Floor-derived height count | 63 |
| Unknown height count | 1,273 |
| Building parts | 64 |
| Invalid geometries | 0 |
| Extraction time | 66.641 s |
| Store ingestion time | 400 ms |
| Store size | 26 MB |

Height coverage:

```text
explicit: 97.42%
floor-derived: 0.12%
unknown: 2.46%
```

## Multi-Region Provider Validation

Temporary query service:

```text
BUILDING_LOCAL_OVERTURE_STORE_DIRS=/tmp/comfortos-overture-minneapolis-store,/tmp/comfortos-overture-seattle-store,/tmp/comfortos-overture-phoenix-store
BUILDING_QUERY_SERVICE_PORT=8791
npm run buildings:serve
```

HTTP provider validation results:

| Region | Query count | Explicit | Floor-derived | Unknown | Dataset version | Latency |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Minneapolis | 284 | 80 | 67 | 137 | 2026-06-17.0 | 812 ms |
| Seattle | 460 | 394 | 13 | 53 | 2026-07-22.0 | 85 ms |
| Phoenix | 758 | 701 | 1 | 56 | 2026-06-17.0 | 8 ms |

Result: the same `HttpBuildingProvider` and multi-region query service work for all three bboxes. No Phoenix-specific provider was introduced.

## Live Phoenix Route Validation

Command:

```text
npm run routes:validate:stage9 -- --output /tmp/comfortos-stage-9-phoenix-heat-validation.json --route-timeout-ms 30000
```

Live NWS / OSRM result before OSRM outage:

| Metric | Value |
| --- | ---: |
| Attempted routes | 18 |
| Successful routes | 9 |
| Failed routes | 9 |
| Heat contexts | 9 |
| Comparable routes | 9 |
| Reranked routes | 2 |
| Average extra duration on reranked routes | 17.15 s |
| Average heat exposure reduction | 11.78% |
| Average direct-sun reduction | 31.17% |
| Average shade increase | 26.78 percentage points |
| Max longest sunny run | 2,028.19 m |

Successful rerank examples:

| Route | Fastest heat | Comfort heat | Direct-sun reduction | Shade increase | Extra duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| ASU Downtown -> Footprint Center | 3.83 | 3.42 | 31.46% | 22.68 pp | 10.7 s |
| Arizona Center -> Heritage Square | 4.33 | 3.78 | 30.87% | 30.87 pp | 23.6 s |

Interpretation:

- `Stay Cool` activated from live heat conditions and data capability.
- Reranking used raw environmental cost, not display score.
- Route differences were not forced; 7 of 9 successful routes kept Fastest as Comfort when candidates did not materially improve heat exposure within policy.

## Controlled Scenario Validation

Controlled scenarios are implemented as research fixtures with:

```text
source = research-scenario
```

Route-level controlled validation was attempted in the same Stage 9 runner. It failed after OSRM began returning `fetch failed`; direct `curl` to `https://routing.openstreetmap.de` also failed to connect on 2026-08-16 during validation.

Deterministic tests still validate controlled Heat Engine behavior:

- Heat Index valid range behavior
- shade reducing direct-sun heat exposure
- night direct solar cost = 0
- ambient nighttime heat remains
- bounded ventilation lowers cost without going below zero
- duration affects total heat exposure
- missing shade keeps heat comfort partial
- heat context activates without city names
- extreme heat outranks light rain
- heavy rain outranks moderate heat
- unavailable heat capability remains balanced

## UI / Product

Added:

- `Stay Cool` contextual route label
- heat panel with estimated heat exposure, direct-sun ratio, estimated building shade, confidence
- route debug fields:
  - heat capable
  - heat severity
  - heat exposure
  - direct sun
  - longest sunny stretch
- `?debug=heat`
- heat map overlay
- navigation preview copy:
  - “Shade begins ahead.”
  - “More exposed section ahead.”
  - “Long sunny stretch ahead.”

Wording deliberately avoids:

- “safe route”
- “medical risk”
- “WBGT”
- “solar radiation W/m²”
- tree-canopy claims

## Validation Commands

Passed:

```text
npx tsc --noEmit
npm test
```

Additional checks still required after final docs/UI pass:

```text
npm run lint
npm run build
mobile/browser smoke
```

## Stage 9 Status

READY WITH EXTERNAL VALIDATION CAVEAT.

The Heat Engine, Phoenix Overture region, data-provider architecture, contextual `Stay Cool` mode, and deterministic tests are valid. Full controlled route-suite acceptance is blocked by public OSRM availability, not by the Heat Engine or provider architecture.
