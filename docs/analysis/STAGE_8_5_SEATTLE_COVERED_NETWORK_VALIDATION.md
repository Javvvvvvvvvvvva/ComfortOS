# Stage 8.5 Seattle Covered Network Validation

Date: 2026-08-13

## Result

```text
RAIN ENGINE VALID, COVER DATA PARTIALLY SUFFICIENT
```

Stage 8.5 confirms that `Stay Dry` can meaningfully differ from Fastest when real mapped covered pedestrian geometry exists near route candidates. It also confirms that the current general Seattle covered-network data is too sparse and uneven to present `Stay Dry` as broadly reliable.

No Rain Comfort weights were changed to force route differences. Stage 6 custom routing remains research-only.

## Source Inventory

| Domain | Source | Use |
| --- | --- | --- |
| Covered features | OpenStreetMap/Overpass static extract at `/tmp/comfortos-seattle-covered-features.geojson` | Normalized rain-cover evidence |
| Buildings | Real Seattle Overture local store at `/tmp/comfortos-overture-seattle-store` | Existing shade/wind inputs |
| Routing | Public OSRM foot service | Fastest and Stage 5 candidates |
| Weather | Controlled rain research scenarios only for Stage 8.5 route differentiation | Research validation, not production claims |
| Seattle pedestrian datasets | Seattle sidewalk inventory, King County sidewalk lines | Useful denominator/network context, not direct shelter evidence |

Public Overpass is not treated as a live critical-path dependency. The recommended rain-cover data path is static/versioned extraction, normalization, and local/provider-backed query.

## OSM Tags Supported

The normalized `CoveredFeatureProvider` now supports:

- `covered=yes` on pedestrian-routable ways
- `covered=arcade` and `covered=colonnade`
- `tunnel=building_passage`
- pedestrian `tunnel=yes`
- `indoor=yes` only for explicit public/permissive pedestrian connectors
- covered transit platforms and station-adjacent pedestrian ways
- access controls from `access`, `foot`, `private`, `customers`, and `permissive`

Rejected semantics:

- covered car-only infrastructure
- ordinary building footprints
- facade proximity
- tree canopy
- private or restricted access
- indoor geometry without public/permissive access evidence

## Normalized Feature Audit

The Stage 8 raw extract had 257 features. After Stage 8.5 semantic normalization, the existing extract produced:

```text
eligible pedestrian covered features: 182
restricted or ineligible after normalization: 75
geometry: 182 LineString
total eligible mapped length: 3,831.66 m
duplicate geometry groups: 0
```

Kind counts:

| Kind | Count |
| --- | ---: |
| roofed-walkway | 147 |
| tunnel | 23 |
| building-passage | 12 |

Access counts:

| Access | Count |
| --- | ---: |
| unknown | 172 |
| permissive | 6 |
| public | 3 |
| customers | 1 |

This is the key quality issue: many geometries are plausible pedestrian shelter, but public access is rarely explicit.

## Covered Network Coverage By Area

Coverage is route-accessible coverage across the 18 general Seattle validation routes, not feature count alone.

| Area | Routes | Mapped Cover Length | Analyzed Route Length | Route-Accessible Covered Length | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| Downtown | 4 | 2,525.15 m | 3,521.83 m | 14.97 m | 0.43% |
| Belltown | 4 | 832.50 m | 5,686.51 m | 8.99 m | 0.16% |
| South Lake Union | 3 | 349.57 m | 5,578.32 m | 0.00 m | 0.00% |
| Capitol Hill | 2 | 203.98 m | 2,987.43 m | 8.99 m | 0.30% |
| University District | 2 | 0.00 m | 2,086.06 m | 0.00 m | 0.00% |
| Waterfront | 3 | 1,622.35 m | 3,161.77 m | 104.93 m | 3.32% |

The best general-sample area was Waterfront at 3.32%. Downtown has the most mapped cover by length, but the representative routes intersected only 14.97 m of it.

## Candidate Cover Opportunity

Across the full controlled-rain validation:

```text
general sample searches: 54
cover-rich searches: 24
general average candidate covered-meter range: 49.19 m
cover-rich average candidate covered-meter range: 41.03 m
```

This means candidate cover opportunity exists sometimes, but for most general Seattle OD pairs it is small or disconnected. In the cover-rich sample, opportunity is concentrated in a few routes rather than broadly distributed.

## Controlled Rain Validation

Full validation command:

```bash
npm run routes:validate:stage8.5 -- --route-timeout-ms 12000 --output /tmp/comfortos-stage-8-5-validation-full.json
```

### General Seattle Sample

| Scenario | Searches | Success | Stay Dry Contexts | Fastest != Stay Dry | Avg Extra Time | Avg Covered Increase | Avg Rain Exposure Reduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| RAIN_LIGHT | 18 | 18 | 9 | 1 | 23.6 s | 17.47 m | 1.83% |
| RAIN_HEAVY_WINDY | 18 | 18 | 9 | 1 | 23.6 s | 17.47 m | 2.14% |
| RAIN_CALM | 18 | 18 | 9 | 0 | 0.0 s | 0.00 m | 0.00% |

Aggregate:

```text
searches: 54
success: 54
failures: 0
Fastest != Stay Dry/Comfort: 2
Fastest == Stay Dry/Comfort: 52
average extra time where different: 23.6 s
average covered-distance increase where different: 17.47 m
average rain-exposure reduction where different: 1.99%
average raw environmental-cost reduction where different: 10.07%
average Comfort/Stay Dry completion: 3,861 ms
```

### Cover-Rich Validation Sample

The cover-rich sample intentionally starts/ends near real extracted covered features. It is valid for engine validation, not for general Seattle frequency.

| Scenario | Searches | Success | Stay Dry Contexts | Fastest != Stay Dry | Avg Extra Time | Avg Covered Increase | Avg Rain Exposure Reduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| RAIN_LIGHT | 8 | 8 | 7 | 2 | 16.8 s | 164.11 m | 43.10% |
| RAIN_HEAVY_WINDY | 8 | 8 | 7 | 2 | 16.8 s | 164.11 m | 43.99% |
| RAIN_CALM | 8 | 8 | 7 | 2 | 16.8 s | 164.11 m | 42.17% |

Aggregate:

```text
searches: 24
success: 24
failures: 0
Fastest != Stay Dry: 6
Fastest == Stay Dry: 18
average extra time where different: 16.8 s
average covered-distance increase where different: 164.11 m
average rain-exposure reduction where different: 43.09%
average raw environmental-cost reduction where different: 39.29%
average Comfort/Stay Dry completion: 2,255 ms
```

This proves reranking can select a different route for rain when candidates actually differ in route-accessible cover.

## Capability Quality Model

`Stay Dry` is consumer-eligible only when the analyzed candidate set has:

```text
covered-feature provider enabled
rain completeness >= 0.75
rain confidence >= 0.45
coveredMeters >= 30 m OR covered ratio >= 3%
longest continuous covered run >= 12 m
```

This prevents `Stay Dry` activation from one isolated feature somewhere in the bbox. Completeness alone is not sufficient, because a fully analyzed route can be confidently uncovered.

## Latency

Full controlled-rain validation averages:

```text
general sample: 3,861 ms
cover-rich sample: 2,255 ms
```

The Stage 7.5 warm target of approximately `<= 5 s` is preserved in these runs. Covered-feature lookup itself was effectively `0 ms` from the static local extract; remaining latency is route candidate generation plus shade/wind/rain candidate analysis.

## Seattle Public Data Research

Seattle publishes sidewalk inventory as public GIS data and Data.gov lists it as a daily-refreshed SDOT sidewalk feature class. This is useful for pedestrian-network denominator/context, but sidewalk presence does not imply overhead rain cover.

King County publishes sidewalk line data for pedestrian walks along roadways. This is also useful network context, but it is not shelter evidence.

Seattle accessibility and sidewalk program materials point to SDOT asset maps, sidewalk asset data, and accessibility route planner resources. These can help future denominator validation and accessibility context, but they do not directly identify covered walkways.

No authoritative Seattle, King County, Sound Transit, or King County Metro open dataset was identified in this stage that can safely mark full station areas or sidewalks as covered. Transit should only enrich cover when actual public covered walkway/platform geometry and access semantics are available.

## Local Covered-Data Strategy

Recommended MVP strategy:

```text
periodic OSM/public extract
↓
semantic/access normalization
↓
versioned local covered-feature store
↓
CoveredFeatureProvider / optional query service
↓
RainAnalysisService
```

This avoids live full-city Overpass dependency while preserving provenance and the existing provider boundary.

## Final Judgment

```text
RAIN ENGINE VALID, COVER DATA PARTIALLY SUFFICIENT
```

Why not `STAY DRY DATA SUFFICIENT FOR MVP`:

- General route-accessible coverage is mostly below 0.5%, except Waterfront at 3.32%.
- Only 2 of 54 general controlled-rain searches selected a different route.
- Explicit public access is rare in the current normalized OSM extract.

Why not `PUBLIC COVER DATA INSUFFICIENT`:

- Cover-rich real-data validation produced 6 of 24 different Stay Dry routes.
- Those different routes averaged 164.11 m more cover and 43.09% lower rain exposure.
- The existing Stage 5 reranking pipeline can use real cover data when candidates intersect it.

## Recommendation

Do not begin Phoenix / Stay Cool yet. The next rain-focused step should improve covered-feature data operations before changing Rain weights or routing:

- build a versioned covered-feature local store/query service
- evaluate targeted public transit/passage/skybridge data only through region adapters
- add an experimental covered-feature waypoint generator only if it remains behind `CandidateGenerator` and is measured against the existing Stage 5 baseline
- keep consumer `Stay Dry` gated by route-accessible cover quality

Stage 8.5 stops here.
