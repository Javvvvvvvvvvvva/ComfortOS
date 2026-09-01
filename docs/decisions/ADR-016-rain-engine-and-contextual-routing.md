# ADR-016 — Rain Engine And Contextual Routing

Date: 2026-08-13
Status: Accepted

## Context

Stage 8 adds Seattle as the second real validation region and introduces the first ComfortOS objective that is not a Minneapolis cold/wind objective:

```text
rain exposure
↓
Stay Dry
```

The product principle remains:

```text
Every city has a different definition of comfort.
```

Seattle validates rain, but rain must not be selected from a city name. Minneapolis with meaningful rain should also be eligible for rain context, and Seattle without rain should remain balanced.

## Decision

Add a deterministic Rain Exposure Engine under:

```text
lib/environment/rain/
```

The Rain Engine consumes normalized `WeatherBundle`, timed route segments, regional wind, and normalized covered features. It does not call NWS, OSRM, Overpass, or Overture directly.

Precipitation semantics are explicit:

- `precipitationMmPerHour` is actual or forecast intensity and drives rain exposure cost.
- `precipitationProbability` is probability and does not become intensity.
- missing intensity lowers confidence/completeness instead of becoming dry.

Add a `CoveredFeatureProvider` boundary under:

```text
lib/environment/coveredFeatures/
```

Stage 8 supports static OSM/Overpass extracts of defensible covered pedestrian features. Raw OSM tags remain outside rain, comfort, routing, and React components.

Covered protection is conservative. Ordinary building footprints do not imply overhead cover. Tree canopy is not modeled as rain cover.

Add `rain` as a Comfort profile using the existing `ComfortAnalysisService` and `RouteComfortCost` contract. Rain profile prioritizes rain exposure, uncovered distance, walking duration, and a bounded wind-driven-rain modifier.

Context selection now supports:

```text
balanced
cold
rain
```

The decision uses live/normalized environmental conditions plus environmental capability:

- meaningful rain + rain capability -> `rain` / `Stay Dry`
- severe cold can outrank light rain
- no rain -> `balanced`
- rain without rain-cover capability -> `balanced` with limited-coverage reason

The production route pipeline remains:

```text
OSRM
↓
Stage 5 CandidateGenerator
↓
shared weather/building/covered-feature context
↓
shade + wind + rain analysis
↓
profile-specific Comfort analysis
↓
raw-cost reranking
```

Stage 6 custom routing remains isolated research.

## Region And Data Decision

Seattle is added through tracked region config:

```text
config/data-regions/seattle.json
```

The same Overture STAC -> DuckDB -> local store/query-service path is used. No Seattle-specific `BuildingProvider` is introduced.

The local building query service can load multiple Overture stores and resolve query regions by store manifest bbox. Runtime app code still consumes only `BuildingProvider`.

## Consequences

- `Stay Dry` is now a real product label, not a design fixture literal.
- Seattle dry weather does not show `Stay Dry`.
- Rain route claims can be debugged through `?debug=rain` or `?debug=environment`.
- Covered-feature data sparsity is visible in debug and validation; sparse OSM cover does not get papered over by building-proximity assumptions.
- Rain analysis adds measurable work, but in Stage 8 validation the dominant latency remains candidate routing and dense environmental analysis.

## Known Limitations

- OSM covered-feature coverage is incomplete and highly uneven.
- The Stage 8 validation extract found useful central-Seattle covered features, but a full Seattle bbox Overpass query timed out.
- Stage 5 candidate generation may not naturally produce routes that exploit sparse covered features.
- Rain Engine is not flooding, puddling, tree canopy, snow/ice, or indoor-routing support.
