# Stage 4 Comfort Engine Audit

Date: 2026-08-09

## Scope

This audit validates and calibrates Stage 4 Comfort Engine v1 before any Stage 4.5 route optimization. It does not add alternate routes, Comfort Route, Stay Warm, reranking, candidate generation, or a route recommendation system.

## Issues Found

1. Missing wind data produced zero wind contribution. In mild weather with no cold stress, this could produce `averageComfortCost = 0` and `Comfort Score = 100`.
2. The score was mathematically correct for the partial inputs but semantically unsafe for route comparison. Missing exposure was displayed like favorable exposure.
3. Confidence existed, but completeness did not. A low-confidence perfect score could still look comparable to complete route scores.
4. Real mild-weather routes scored in the low 90s. This is mostly explained by warm live weather and route similarity, but rounded scores compress small differences.

## Decision

Stage 4 now uses Strategy A:

```text
complete weather + wind + shade dimensions -> numeric Comfort Score
missing required dimension -> partial raw analysis, no numeric Comfort Score
```

Raw component cost is still calculated for diagnostics. Missing wind is not penalized and not invented. It is simply not eligible for a comparable consumer score.

## Confidence vs Completeness

Confidence answers whether available values are trustworthy. Completeness answers whether the intended model dimensions were present.

```ts
type ComfortAnalysisCompleteness = {
  weatherAvailable: boolean;
  windAvailable: boolean;
  shadeAvailable: boolean;
  weatherWeight: number;
  windWeight: number;
  shadeWeight: number;
  analyzedWeight: number;
  comparable: boolean;
};
```

The current cold-profile completeness weights are:

| Dimension | Weight |
| --- | ---: |
| Weather | 0.50 |
| Wind | 0.35 |
| Shade | 0.15 |

`comfortScore` is `null` when `scoreStatus = "partial"`.

## Score Mapping

The score mapping did not change:

```text
Comfort Score = round(100 * exp(-averageComfortCost / 4.5))
```

The audit found no unrealistic reversal in the mapping. Compression exists for small shade-only changes, but raw cost preserves ordering. Future routing must not use the rounded score.

## Raw-Cost Discrimination

Controlled routes with the same duration and ambient weather:

| Scenario | Raw average cost | UI score |
| --- | ---: | ---: |
| A open + high headwind + shade | 4.346 | 38 |
| B partial shelter + moderate wind + some sun | 2.985 | 52 |
| C strong shelter + low wind + direct winter sun | 1.709 | 68 |

Ordering is preserved: `C > B > A`.

Small realistic differences:

| Pair | Raw cost delta | Score delta |
| --- | ---: | ---: |
| Wind 2.0 -> 2.5 m/s | +0.136 | -2 |
| Headwind 0.5 -> 1.0 m/s | +0.056 | -1 |
| Shade 30% -> 60% | +0.048 | 0 |

Raw cost is the right routing input because it preserves sub-score resolution.

## Calibration Matrix Findings

The 5 x 4 x 3 matrix covered:

```text
temperature: -20, -10, 0, 5, 10 C
pedestrian wind: 0, 2, 5, 10 m/s
shade: 0, 0.5, 1
```

Findings:

- No discontinuities or reversals were observed.
- Score range was 26-100 across the matrix.
- Severe cold plus strong wind produced low scores.
- Mild cold plus calm conditions produced high scores.
- At 10 C and 0 m/s wind, cost reaches 0 and score 100, which is acceptable because the cold profile has no cold, wind, or winter sun penalty there.
- Shade differences intentionally have small score effect; raw cost still changes monotonically in cold daylight.

Extreme calibration:

| Scenario | Raw average cost | UI score |
| --- | ---: | ---: |
| Severe cold + high wind | 6.600 | 23 |
| Severe cold + strong shelter | 3.358 | 47 |
| Mild cold + calm | 0.486 | 90 |
| Mild cold + moderate wind | 1.803 | 67 |

## Live Minneapolis Rerun

Live validation used current NWS weather and OSM/Overpass provider responses. Public Overpass variability caused several wind analyses to fail during this pass; those routes are now partial and do not receive numeric Comfort Scores.

| Route | Avg cost | Total cost | Score | Confidence | Completeness | Dimensions | Dominant factors |
| --- | ---: | ---: | --- | ---: | ---: | --- | --- |
| Downtown grid | 0.000 | 0.000 | Limited data | 0.537 | 0.588 | weather + shade, wind missing | none |
| University edge | 0.000 | 0.000 | Limited data | 0.510 | 0.621 | weather + shade, wind missing | none |
| River park | 0.000 | 0.000 | Limited data | 0.548 | 0.575 | weather + shade, wind missing | none |
| Residential | 0.440 | 5.128 | 91 | 0.637 | 0.783 | weather + wind + shade | wind 72%, crosswind 28% |
| Bridge open retry | 0.000 | 0.000 | Limited data | 0.430 | 0.500 | weather only | none |

Mild live weather around 29 C explains the low raw costs when wind analysis is missing or modest: the cold profile has no cold penalty and no winter sun penalty in warm conditions. The critical fix is that partial routes no longer display `100`.

## Future Route-Cost Contract

Stage 4.5 should consume raw cost, not rounded display score:

```ts
type RouteComfortCost = {
  environmentalExposureCost: number;
  averageEnvironmentalCost: number;
  analyzedDurationMinutes: number;
  confidence: number;
  completeness: number;
  comparable: boolean;
};
```

Walking time remains separate. Future conceptual optimization:

```text
routing cost = walking time cost + lambda * environmentalExposureCost
```

This audit does not choose `lambda`.

## Judgment

READY FOR STAGE 4.5.
