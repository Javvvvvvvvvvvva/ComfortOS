# Snow Comfort v1 Validation

Date: 2026-09-13
Result: Accepted for limited-beta exposure comparison

## Scope

This validation covers normalized NWS snowfall and ice accumulation, precipitation-type
classification, route-time interpolation, estimated pedestrian wind, public overhead cover,
Snow Comfort raw-cost comparison, completeness gates, and consumer claim boundaries.

## Controlled Results

| Contract | Result |
| --- | --- |
| Known zero snow/ice produces zero winter exposure | Pass |
| Overhead cover reduces active snowfall exposure | Pass |
| Stronger pedestrian wind increases snowfall exposure | Pass |
| Overhead cover does not erase ice exposure | Pass |
| Missing winter rates stay partial and non-comparable | Pass |
| Covered, lower-wind candidate has lower raw Snow Comfort cost | Pass |
| Active snowfall selects Snow Comfort only when capability is ready | Pass |
| Frozen precipitation is excluded from liquid-rain routing | Pass |

The full project suite passed 277 of 277 tests.

## Live NWS Results

The nationwide live validation ran against one existing Stage 10 route point in every state
and the District of Columbia. All 51 locations passed. Each returned 156 hourly forecast
points, for 7,956 total points, and the first 24 hours had 100% snowfall, ice-accumulation,
precipitation-type, and usable-wind-vector coverage.

NWS grid horizons vary by forecast office. Full 156-hour snowfall and ice coverage was as low
as 44.23%, equivalent to 69 hourly points, while the product's 24-hour routing gate remained
complete. Missing long-range values remain missing and make a future route non-comparable;
they are never converted to zero.

The live end-to-end pass also exercised one representative route in all 51 jurisdictions via
managed Mapbox walking, the R2-backed building query service, NWS, Snow analysis, and Comfort
reranking. It issued 153 managed routing requests and returned 97 comparable candidates with
no failed jurisdiction.

This validates the nationwide representative provider and integration contracts. It is not an
active-storm field calibration or a test of every address and walking segment in a state.

## Accepted Claim

`Snow Comfort` means lower modeled exposure among comparable candidate routes using forecast
snowfall/ice accumulation, cold, estimated pedestrian wind, known public overhead cover, route
timing, and duration.

It does not mean plowed, ice-free, accessible, low-slip, or safe. Terrain grade, current
sidewalk state, municipal plow progress, and field calibration are not active inputs.

## Release Judgment

Accepted for limited-beta relative route comparison with the explicit limitations above.
