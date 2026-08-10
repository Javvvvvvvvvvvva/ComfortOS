# ADR-007: Stage 4 Comfort Engine v1

Date: 2026-08-09
Status: Accepted

## Context

Stage 4 needs the first deterministic Comfort Engine for one already-selected walking route. The engine must answer how comfortable each segment and the route overall are using normalized weather, shade, wind, and timed-route outputs. It must not generate alternate routes or allow Comfort Cost to influence route selection yet.

## Decision

ComfortOS adds a `lib/comfort` domain boundary and `/api/environment/comfort` application route.

The Stage 4 pipeline is:

```text
RouteResult
    -> timed route segments
    -> normalized weather state per segment
    -> optional normalized shade result per segment
    -> optional normalized wind result per segment
    -> SegmentComfortInput
    -> SegmentComfortResult
    -> RouteComfortSummary
```

The Comfort Engine consumes normalized ComfortOS outputs only. It does not call NWS, Overpass, OSRM, MapLibre, or provider-specific APIs.

## Raw Cost And UI Score

The internal model reports raw `totalComfortCost` and `averageComfortCost`. These are decomposable cost values, not consumer-facing percentages.

The UI score is a deterministic monotonic mapping:

```text
Comfort Score = round(100 * exp(-averageComfortCost / scoreCostScale))
```

Lower raw cost always maps to an equal or better score. Routing must not optimize against the UI score. Future graph routing should use raw cost or an explicitly documented derivative.

## Cold-Weather Profile

Stage 4 productionizes only the cold profile. The core formula is location-independent and selected by profile, not by city name. Minneapolis is a validation scenario, not a hard-coded algorithm branch.

The initial cold weights are centralized in `lib/comfort/weights.ts`:

```text
temperature: 3.00
estimatedWindChill: 1.15
windExposure: 1.55
headwind: 0.90
crosswind: 0.45
winterSunBenefit: 0.35
```

The profile treats cold ambient temperature, estimated pedestrian wind exposure, headwind, and crosswind as costs. Daytime direct-sun proxy is a small benefit. Building shade can remove that benefit in winter, but shade is not treated as universally bad outside this profile.

## Wind Chill

Stage 4 uses the recognized Celsius wind-chill formulation only within its validity range:

```text
temperature <= 10 C
wind speed > 4.8 km/h
```

For route comfort, the wind input is estimated pedestrian wind exposure, not raw regional weather wind. The output is therefore labeled `estimatedPedestrianWindChillC` and must not be described as measured temperature.

## Shade And Sun Heuristic

Stage 4 does not model solar radiation, UV, surface heat, or full sky exposure. In the cold profile:

```text
daytime + lower building shade ratio -> modest winter sun benefit
night or missing shade -> no solar benefit
```

This is intentionally conservative until a future radiation/UV/thermal-surface model exists.

## Aggregation

Comfort Cost represents pedestrian exposure over time. Segment costs are cost rates multiplied by estimated segment traversal duration. Route average cost is total cost divided by route duration. This prevents short and long uncomfortable segments from being averaged equally.

## Confidence

Comfort confidence is composed from input quality instead of multiplying every factor blindly. Segment confidence uses weather, wind, shade, and a small route-geometry base term. Missing wind or shade lowers confidence but does not block analysis when weather and route geometry are available.

## Consequences

- React components consume normalized comfort results and do not perform comfort calculations.
- Comfort analysis degrades gracefully when shade or wind is unavailable.
- Debug mode can inspect comfort via `?debug=comfort` or `?debug=environment`.
- Stage 4 establishes an explainable cost model before routing uses environmental costs.

## Limitations

- Cold profile only.
- No route optimization.
- No Comfort Route, Stay Warm, Stay Dry, Stay Cool, route ranking, or recommendation.
- No Climate DNA auto-selection.
- No rain, heat, AQI, snow/ice, tree canopy, ML, CFD, or LLM explanation.
- Comfort Score is a human-readable presentation score, not a scientifically exact physiological measurement.

## Future Work

- Add heat and rain profiles behind the same profile boundary.
- Calibrate weights against user research, sensor data, or accepted biometeorological models.
- Incorporate solar radiation, UV, tree canopy, precipitation, snow/ice, and air quality.
- Feed raw Comfort Cost into graph routing only after separate route-optimization design and validation.

## Stage 4 Audit Amendment: Partial Scores And Route-Cost Contract

Amendment date: 2026-08-09

The Stage 4 audit found that missing wind could produce a raw average cost of `0` in mild weather and therefore map to a misleading `100` Comfort Score. The raw partial analysis was internally explainable, but the consumer score was semantically wrong for future route comparison because missing exposure was being displayed like ideal exposure.

ComfortOS therefore uses Strategy A for Stage 4:

```text
complete required dimensions -> numeric Comfort Score
missing required dimension -> partial raw analysis, no numeric Comfort Score
```

The engine now reports explicit completeness:

```ts
type ComfortAnalysisCompleteness = {
  weatherAvailable: boolean;
  windAvailable: boolean;
  shadeAvailable: boolean;
  analyzedWeight: number;
  comparable: boolean;
};
```

Weather, wind, and shade are all required for a comparable cold-profile display score. Partial route coverage contributes to `analyzedWeight`; low-confidence inputs remain confidence, not completeness. Confidence answers "how much do we trust the observed/estimated values?" Completeness answers "which intended model dimensions were present?"

The score mapping is unchanged:

```text
Comfort Score = round(100 * exp(-averageComfortCost / scoreCostScale))
```

but `comfortScore` is `null` when `scoreStatus = "partial"`. Debug output may still show `averageComfortCost` and component costs for diagnosis.

Future route optimization must consume raw route-cost fields:

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

Normal walking-time cost must remain separate. A future conceptual objective may be:

```text
routing cost = walking time cost + lambda * environmentalExposureCost
```

Stage 4 does not choose `lambda`, does not generate candidate routes, and does not rank routes.
