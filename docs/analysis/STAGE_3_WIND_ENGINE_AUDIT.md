# Stage 3 Wind Engine Audit

Date: 2026-08-09

## Scope

This audit validates the completed Stage 3 Wind Engine only. It does not introduce Comfort Engine behavior, Comfort Score, alternate routing, Stay Warm/Stay Dry/Stay Cool routing, rain, snow, AQI, tree canopy, or city-specific core algorithms.

## Defects Found And Fixed

1. Route-level confidence double-counted building-height uncertainty. Segment confidence already included local height coverage, then route confidence multiplied height coverage again. Stage 3 now carries `windDataConfidence` separately and composes route confidence from distinct quality inputs.
2. Route wind accounting exposed only sheltered, exposed, and unknown meters. Known moderate segments were omitted from the distance buckets. Stage 3 now reports `neutralMeters`, and sheltered + neutral + exposed + unknown reconciles to route length.
3. Unknown-height buildings marked whole segments unknown when near the route. Stage 3 now uses a distance-weighted partial unknown-meter penalty.
4. Malformed building geometries could enter wind projection. Stage 3 now skips malformed or empty polygon parts during wind modeling.

## Live Minneapolis Validation

Networked validation used live NWS wind and live OSM/Overpass building data.

| Route | Segments | Buildings | Avg exposure m/s | Headwind | Crosswind | Sheltered m | Neutral m | Exposed m | Unknown m | Confidence |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Downtown grid | 24 | 102 | 1.57 | 0.00 | 1.14 | 249.4 | 427.3 | 0.0 | 32.8 | 0.664 |
| University edge | 19 | 43 | 2.03 | 0.00 | 1.89 | 29.4 | 520.7 | 0.0 | 9.2 | 0.617 |
| River park | 34 | 85 | 1.62 | 0.00 | 0.52 | 0.0 | 898.7 | 0.0 | 111.8 | 0.548 |
| Residential | 27 | 438 | 2.05 | 0.00 | 2.19 | 0.0 | 574.9 | 0.0 | 221.6 | 0.411 |
| Bridge open retry | 12 | 17 | 1.87 | 0.00 | 0.89 | 0.0 | 314.3 | 0.0 | 28.8 | 0.535 |

One longer bridge/open Overpass request returned `Building data unavailable`; a shorter nearby bridge/open route succeeded. This is provider availability noise, not a wind-model crash.

## Synthetic Validation

Wind strength sweep on the same fixture route:

| Regional speed m/s | Avg exposure m/s | Headwind | Crosswind | Sheltered m | Neutral m | Unknown m | Confidence |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 0.00 | 0.00 | 0.00 | 25.0 | 63.9 | 11.1 | 0.627 |
| 2 | 1.97 | 2.00 | 0.00 | 25.0 | 63.9 | 11.1 | 0.627 |
| 5 | 4.93 | 5.00 | 0.00 | 25.0 | 0.0 | 11.1 | 0.627 |
| 10 | 9.85 | 10.00 | 0.00 | 25.0 | 0.0 | 11.1 | 0.627 |

Wind direction sweep at 5 m/s produced direction-sensitive headwind/crosswind, shelter, and exposure changes. Segment-time forecast validation on a 100-segment synthetic route selected 2.03 m/s on the first segment, 5.03 m/s near the middle, and 7.97 m/s on the final segment.

## Performance

Fixture benchmark with 80 building footprints:

| Route size | Segments | Time |
| --- | ---: | ---: |
| Current-ish 600 m route | 20 | 35.96 ms |
| 1,500 m route | 50 | 5.89 ms |
| 3,000 m route | 100 | 7.60 ms |

The first run includes warmup overhead. Subsequent 50- and 100-segment runs remained below 10 ms for model computation with cached fixture data.

## UI Debug Smoke

`?debug=wind` loaded without browser console warnings or errors. A short downtown route displayed the wind debug summary with regional wind, exposure, headwind, crosswind, sheltered, neutral, exposed, and unknown meters. `?debug=environment` also loaded without browser console warnings or errors.

Screenshot: `stage3-wind-debug-smoke.png`

## Judgment

READY FOR STAGE 4.
