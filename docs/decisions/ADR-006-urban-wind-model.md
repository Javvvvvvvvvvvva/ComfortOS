# ADR-006: Stage 3 Urban Wind Model

Date: 2026-08-09
Status: Accepted

## Context

Stage 3 needs deterministic pedestrian wind exposure analysis for an already-selected walking route. The model must consume normalized weather data, use route segment timing, and estimate building shelter without introducing Comfort routing, a Comfort Score, or a CFD claim.

Meteorological wind direction is a critical convention: reported wind direction is where wind comes from. A north wind moves air from north to south. ComfortOS keeps that convention explicit in `WindState.directionFromDeg`.

## Decision

ComfortOS adds a Stage 3 `WindAnalysisService` and `UrbanWindModel` boundary.

The pipeline is:

```text
normalized WeatherBundle
    -> segment midpoint timestamp
    -> WindState
    -> route segment bearing
    -> headwind / crosswind / tailwind decomposition
    -> nearby building geometry
    -> upwind shelter estimate
    -> openness / channeling modifier
    -> SegmentWind
    -> distance-weighted RouteWindSummary and WindQuality
```

The Stage 3 implementation is `HeuristicUrbanWindModel`. It is not CFD and does not produce measured street wind.

## Vector Convention

Route segment bearings are pedestrian travel bearings in degrees clockwise from north.

Weather wind direction is meteorological FROM direction. Directional components compare pedestrian bearing to `directionFromDeg`:

- same direction as wind-from bearing means headwind
- opposite direction means tailwind
- perpendicular direction means crosswind

## Shelter Assumptions

Buildings can reduce estimated exposure only when they are upwind of the segment midpoint. A building downwind of a segment does not shelter it from incoming wind.

The shelter heuristic weights:

- building height
- perpendicular building width relative to wind
- distance from the segment in the upwind direction
- lateral alignment with the wind path
- height provenance

Unknown-height buildings do not create strong shelter. They contribute partial unknown route meters by proximity to the segment instead of marking an entire segment unknown. Floor-derived heights contribute less confidence than explicit measured/provider heights.

## Openness And Channeling

Nearby buildings on neither side of a route segment are treated as open. Buildings on one side are treated as a one-sided built edge. Buildings on both sides are treated as a simple street-canyon condition.

A canyon aligned with wind motion may receive a small channeling modifier. The modifier is capped and conservative. If alignment or canyon evidence is weak, no amplification is applied.

## Confidence

Stage 3 reports:

```ts
type WindQuality = {
  weatherConfidence: number;
  geometryCoverage: number;
  heightCoverage: number;
  shelterModelConfidence: number;
  routeAnalysisCoverage: number;
  overallConfidence: number;
};
```

Route meters are accounted as sheltered, neutral, exposed, or unknown. Neutral is a known environmental state, not a missing-data bucket.

Lack of nearby buildings is not unknown. It is valid evidence of an open, exposed condition. Unknown or low-confidence states come from missing wind data, invalid route geometry, missing building heights near the route, and the inherently heuristic shelter model.

Overall confidence combines weather confidence, geometry coverage, height coverage, shelter-model confidence, and route-analysis coverage. Segment confidence keeps wind-data confidence separate from local-height coverage so route-level confidence does not double-count the same building-height uncertainty.

## Consequences

- UI consumes normalized wind-analysis results and does not perform wind vector calculations.
- Wind failure does not block standard routing, weather, or shade.
- Debug mode can inspect wind exposure independently through `?debug=wind` and together with shade through `?debug=environment`.
- Stage 3 can support future predictive routing because each segment uses its estimated midpoint timestamp.

## Future Replacement Path

The `UrbanWindModel` interface can later be replaced by:

- calibrated heuristic coefficients
- precomputed CFD by tile or corridor
- ML surrogate models trained on CFD or observations
- observational correction from local sensor networks

## Non-Goals

- No full CFD.
- No ML wind model.
- No Comfort Engine.
- No Comfort Score.
- No wind-aware alternate routing.
- No wind-chill route ranking.
- No Climate DNA.
- No tree, rain, snow, AQI, or city-specific wind implementation.
