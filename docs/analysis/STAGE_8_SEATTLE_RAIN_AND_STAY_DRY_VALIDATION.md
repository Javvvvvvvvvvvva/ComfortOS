# Stage 8 Seattle Rain And Stay Dry Validation

Date: 2026-08-13

## Result

```text
RAIN ENGINE IMPLEMENTED
STAY DRY CONTEXT IMPLEMENTED
SEATTLE OVERTURE INGESTION PASS
FULL 18-ROUTE OSRM VALIDATION NOT COMPLETED IN INTERACTIVE WINDOW
```

Stage 8 proves the architecture can add a city-different environmental dimension without city-name branching:

```text
Seattle + dry live weather -> balanced / Comfort
controlled meaningful rain -> rain / Stay Dry
```

## Seattle Region

Tracked config:

```text
config/data-regions/seattle.json
```

Bbox:

```text
west:  -122.42
south:   47.58
east:  -122.27
north:   47.68
```

This covers downtown, Belltown, Capitol Hill, South Lake Union, University District, and the central waterfront. It does not ingest all Washington state.

## Real Overture Ingestion

Command:

```text
npm run data:buildings:seattle -- --output /tmp/comfortos-overture-seattle-store
```

Source:

```text
STAC root: https://stac.overturemaps.org/catalog.json
release: 2026-07-22.0
theme: buildings
type: building
asset: 00033
license: ODbL-1.0
```

Stats:

```text
extraction time: 52.807 s
store build time: 1.186 s
building count: 117,331
explicit heights: 82,065
floor-derived heights: 122
unknown heights: 35,144
building parts: 405
invalid geometry: 0
store size: 65 MB
buildings.jsonl: 64 MB
tile-index.json: 740 KB
```

Source datasets:

```text
Esri Community Maps
Microsoft ML Buildings
OpenStreetMap
USGS Lidar
```

## Covered Feature Source

Stage 8 adds:

```text
CoveredFeatureProvider
```

Real central-Seattle covered-feature audit:

```text
npm run data:covered-features:overpass -- --bbox -122.36,47.595,-122.315,47.625 --output /tmp/comfortos-seattle-covered-features.geojson
```

Result:

```text
source: OpenStreetMap via Overpass
covered feature count: 257
query time: 1.5 s
```

Full Seattle-region covered-feature query was attempted, but Overpass timed out with HTTP 504. The Stage 8 report therefore treats covered-feature coverage as useful but incomplete.

## Rain Engine Architecture

Implemented:

```text
lib/environment/rain/
```

Inputs:

- normalized `WeatherBundle`
- timed route segments
- normalized `CoveredFeature[]`
- regional wind speed/direction

Outputs:

- `SegmentRainExposure`
- `RouteRainSummary`
- debug GeoJSON segments for `?debug=rain`

Formula:

```text
rain exposure =
precipitation intensity factor
× exposed route fraction
× wind-driven modifier
× exposure duration
```

Probability is tracked, but it is not treated as rain intensity.

## Wind-Driven Rain

The modifier uses:

- regional wind speed
- regional wind direction
- segment bearing
- covered ratio

It is bounded and heuristic. It is not CFD and does not claim street-level measured wetness.

## Context Decision

Implemented contexts:

```text
balanced -> Comfort
cold     -> Stay Warm
rain     -> Stay Dry
```

Rules:

- meaningful rain plus rain capability activates `rain`
- no rain remains `balanced`
- rain without environmental capability remains `balanced` with limited-coverage reason
- severe cold outranks light rain

No city-name condition activates `Stay Dry`.

## Validation Routes

Seattle route suite:

```text
config/validation-routes/seattle-stage8.json
```

The suite contains 18 OD pairs across:

- downtown dense grid
- waterfront/open corridors
- Belltown
- Capitol Hill
- South Lake Union
- University District
- covered-feature audit corridors

The suite stores only OD labels and coordinates.

## Live Seattle Weather Validation

Bounded validation command:

```text
npm run routes:validate:stage8 -- --local-store /tmp/comfortos-overture-seattle-store --covered-features /tmp/comfortos-seattle-covered-features.geojson --limit 4 --route-timeout-ms 12000 --output /tmp/comfortos-stage-8-seattle-rain-validation-limit4-timeout.json
```

Live NWS result:

```text
searches: 4
success: 4
failures: 0
Limited Data: 0
Stay Dry contexts: 0
Fastest != Stay Dry/Comfort: 0
Fastest == Comfort: 4
average Comfort completion: 2,003.5 ms
average covered feature count: 32
```

Interpretation:

Live Seattle weather was not materially raining for these requests. The app correctly stayed in balanced `Comfort` mode and did not show `Stay Dry` just because the routes were in Seattle.

## Controlled Rain Research Validation

Controlled rain scenarios are isolated under:

```text
lib/routing-research/environment/rainScenarios.ts
```

They are marked:

```text
source = research-scenario
```

They are not injected into production runtime unless explicitly passed by validation scripts.

### RAIN_LIGHT

```text
searches: 4
success: 4
failures: 0
Limited Data: 0
Stay Dry contexts: 4
Fastest != Stay Dry: 0
Fastest == Stay Dry: 4
average Comfort/Stay Dry completion: 5,777 ms
average extra duration where different: 0 s
average rain exposure reduction where different: 0%
```

### RAIN_HEAVY_WINDY

```text
searches: 4
success: 4
failures: 0
Limited Data: 0
Stay Dry contexts: 4
Fastest != Stay Dry: 0
Fastest == Stay Dry: 4
average Comfort/Stay Dry completion: 5,948.75 ms
average extra duration where different: 0 s
average rain exposure reduction where different: 0%
```

### RAIN_CALM

```text
searches: 4
success: 4
failures: 0
Limited Data: 0
Stay Dry contexts: 4
Fastest != Stay Dry: 0
Fastest == Stay Dry: 4
average Comfort/Stay Dry completion: 5,970.75 ms
average extra duration where different: 0 s
average rain exposure reduction where different: 0%
```

Interpretation:

The context engine correctly activates `Stay Dry` under meaningful rain. The route selector did not force a different route. In the bounded route slice, the Stage 5 candidate set and sparse mapped cover did not produce a lower-rain alternative that beat the fastest route under detour and meaningful-improvement policy.

## Cover Data Quality

Observed per-route covered-feature counts in the 4-route slice:

```text
47
44
7
30
```

Observed covered meters on selected routes:

```text
Pike Place to SLU: 34.36 m
Waterfront to Pioneer Square: 0 m
Belltown to Westlake: 0 m
Capitol Hill to downtown: 4.89 m
```

The correct Stage 8 conclusion is that OSM covered-feature data exists in central Seattle but is too sparse, uneven, or not aligned with generated candidates to guarantee Stay Dry route differentiation.

## Latency

Live validation average:

```text
2,003.5 ms
```

Controlled rain averages:

```text
RAIN_LIGHT: 5,777 ms
RAIN_HEAVY_WINDY: 5,948.75 ms
RAIN_CALM: 5,970.75 ms
```

This is above the ideal `<= 5 s` warm target for controlled scenarios, but still below the 12 s MVP timeout. The primary bottleneck remains candidate routing and dense per-candidate environmental analysis, not covered-feature fetch.

## Full-Run Limitation

A full 18-route validation across live weather plus three controlled scenarios was started, but public OSRM-backed route comparison did not complete within the interactive validation window before being stopped. A 4-route bounded validation with per-route 12 s timeouts completed successfully.

Stage 8 is therefore validated for architecture, data ingestion, context semantics, and bounded route behavior, but full 18-route route-differentiation statistics remain future work.

## Browser Regression

Browser validation ran with:

```text
BUILDING_PROVIDER=http-overture
BUILDING_QUERY_SERVICE_URL=http://127.0.0.1:8787
COVERED_FEATURE_PROVIDER=static-osm
COVERED_FEATURE_STATIC_GEOJSON=/tmp/comfortos-seattle-covered-features.geojson
```

Viewport checks:

```text
375x812: no horizontal overflow; no text overflow; map visible
390x844: no horizontal overflow; no text overflow; map visible
430x932: no horizontal overflow; no text overflow; map visible
1280x900: no horizontal overflow; no text overflow; map visible
```

Screenshot artifacts:

```text
/tmp/comfortos-stage-8-375x812.png
/tmp/comfortos-stage-8-390x844.png
/tmp/comfortos-stage-8-430x932.png
/tmp/comfortos-stage-8-1280x900.png
```

The live browser state displayed balanced `Comfort` language because live weather was dry. This confirms the critical Stage 8 rule that Seattle-like geography alone does not activate `Stay Dry`.
