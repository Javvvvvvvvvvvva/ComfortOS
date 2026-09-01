# ADR-018 — Heat Engine And Stay Cool Routing

Date: 2026-08-16
Status: Accepted

## Context

Stage 9 adds Phoenix as a third real validation region and introduces the first hot-weather ComfortOS objective:

```text
heat exposure
↓
Stay Cool
```

The product principle remains location-independent. Phoenix validates heat, but heat routing must activate from weather, shade, solar, route timing, and data capability. Core algorithms must not contain checks like:

```ts
city === "Phoenix"
```

## Decision

Add a deterministic Heat Exposure Engine under:

```text
lib/environment/heat/
```

The Heat Engine consumes:

- normalized `WeatherBundle`
- timed route geometry
- `ShadeAnalysisResult`
- `WindAnalysisResult`

It does not call NWS, OSRM, Overpass, Overture, or React directly.

The central formula is:

```text
ambient heat
+ humidity modifier
+ direct-sun exposure
- bounded ventilation modifier
```

Direct-sun exposure is a proxy derived from daylight solar elevation and `1 - estimated building shade ratio`. Stage 9 does not claim measured solar radiation, WBGT, UV, tree canopy, or medical heat risk.

Night routes keep ambient heat cost but set direct solar cost to zero.

## Apparent Temperature And Heat Index

NWS apparent temperature / Heat Index semantics are treated conservatively:

- NWS Heat Index is only used in warm valid ranges.
- Heat Index is a shade/light-wind apparent-temperature construct, not a direct-sun or WBGT measurement.
- Direct sun is modeled separately through estimated shade and solar elevation.
- Hot dry wind can be hazardous; ventilation benefit is bounded and reduced at severe/extreme heat.

## Routing Context

Context selection now supports:

```text
balanced
cold
rain
heat
```

The consumer label for heat is:

```text
Stay Cool
```

Context selection uses normalized weather severity plus data capability:

- high heat + heat capability -> `heat` / `Stay Cool`
- heavy rain can outrank moderate heat
- extreme heat can outrank light rain
- severe cold can still outrank light rain
- hot weather without heat capability remains `balanced` with limited-coverage reason

Official NWS alerts remain separate and must not be softened into route-comfort claims. `Stay Cool` is a comfort/exposure estimate, not a safety guarantee.

## Region And Data Decision

Phoenix is added through tracked region config:

```text
config/data-regions/phoenix.json
```

The same Overture -> DuckDB -> local store/query-service path is used. No Phoenix-specific `BuildingProvider` is introduced.

During Stage 9 validation the documented STAC root was unavailable, so the extractor attempted STAC and then used DuckDB parquet metadata over the official public Overture release glob to select intersecting assets. This remains real Overture data and does not permit fixture fallback.

## Consequences

- `Stay Cool` is now a real product label, not a design fixture literal.
- Route comparison debug includes heat capability, heat severity, average heat exposure, direct-sun ratio, and longest sunny stretch.
- `?debug=heat` renders heat exposure segments; `?debug=environment` includes heat with other overlays.
- Comfort Cost completeness now includes heat availability. Missing shade/heat inputs do not produce a complete route score.
- Active navigation copy may say “Shade begins ahead,” “More exposed section ahead,” or “Long sunny stretch ahead,” but must not claim safe routing.

## Known Limitations

- Building shade excludes tree canopy.
- Direct sun is estimated from building shade and solar elevation, not measured radiation.
- Public OSRM availability can limit validation route coverage.
- Heat Engine is not a medical heat-risk model, WBGT, occupational safety model, or emergency-alert substitute.
