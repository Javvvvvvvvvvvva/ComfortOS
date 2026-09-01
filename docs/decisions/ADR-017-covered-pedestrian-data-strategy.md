# ADR-017 — Covered Pedestrian Data Strategy

Date: 2026-08-13
Status: Accepted

## Context

Stage 8 validated the Rain Engine and `Stay Dry` context, but the central Seattle covered-feature extract was too sparse to consistently produce routes different from Fastest. The raw feature count also mixed several semantics: defensible pedestrian cover, car-only covered infrastructure, indoor corridors with unclear access, tunnels, building passages, and short isolated fragments.

Stage 8.5 answers whether ComfortOS can build a useful and trustworthy rain-shelter layer from available real data without tuning Rain weights to force route differences.

## Decision

Keep covered pedestrian data behind the existing normalized boundary:

```text
source extract / optional region adapter
↓
CoveredFeatureProvider
↓
CoveredFeature[]
↓
RainAnalysisService
```

Production Rain, Comfort, routing, and React code must not consume raw OSM, Seattle GIS, Sound Transit, King County Metro, or Overture-native schemas.

Normalize covered features into explicit defensible kinds:

```ts
type CoveredFeatureKind =
  | "roofed-walkway"
  | "arcade"
  | "building-passage"
  | "tunnel"
  | "indoor-public-connector"
  | "transit-covered-walkway";
```

Each normalized feature carries cover and access evidence:

```ts
type CoverEvidence = {
  source: string;
  kind: CoveredFeatureKind;
  confidence: number;
  access: "public" | "permissive" | "customers" | "unknown" | "restricted";
  accessConfidence: number;
};
```

Unknown access is not treated as private, but it lowers access confidence. Restricted access is excluded from rain-cover eligibility. Indoor connectors are only eligible when public or permissive access is explicit; ComfortOS does not build indoor navigation.

## Source Semantics

Supported OpenStreetMap semantics include:

- `covered=yes` on pedestrian-routable ways
- `covered=arcade` and `covered=colonnade`
- `tunnel=building_passage`
- pedestrian `tunnel=yes`
- explicit public or permissive `indoor=yes` pedestrian connectors
- covered transit platforms and station-adjacent pedestrian walkways
- access controls from `access`, `foot`, `private`, `customers`, `permissive`, and related tags

Ordinary building footprints, facade proximity, unrelated building tags, and tree canopy are not rain-cover evidence.

## Capability Quality

`Stay Dry` consumer eligibility must be evidence-based. A route comparison is rain-cover capable only when the analyzed candidate set has:

- successful covered-feature provider metadata
- route rain completeness at least `0.75`
- route rain confidence at least `0.45`
- at least `30 m` covered on a candidate, or at least `3%` analyzed route cover
- a continuous covered run of at least `12 m`

Completeness alone is insufficient because a fully analyzed route can be confidently uncovered.

## Local Ingestion Strategy

Public Overpass is acceptable for development extraction, but it is not reliable enough for live route requests or full-city critical-path queries. Covered infrastructure changes slowly, so the preferred MVP strategy is:

```text
OSM/public extract
↓
normalization + semantic/access filtering
↓
versioned local covered-feature store
↓
CoveredFeatureProvider / future query service
```

Region enrichment is allowed through optional adapters behind the same provider boundary. Core algorithms must not contain checks like `city === "Seattle"`.

## Seattle Public Data

Seattle and King County publish useful pedestrian infrastructure datasets, including Seattle sidewalk inventory and King County sidewalk lines. These are useful denominator/network data, not direct rain-shelter evidence. They should not be converted into cover without explicit roof, tunnel, passage, station, or access evidence.

Transit data may be useful only when it provides actual walkable covered geometry. A station polygon or stop marker is not enough to mark an entire route segment as covered.

## Consequences

- Stage 8's raw 257 covered-feature count is no longer treated as normalized eligible cover.
- The existing extract normalizes to 182 eligible pedestrian covered features after excluding unsupported/car-only semantics.
- Rain debug can report eligible feature counts, cover quality, covered meters, covered ratio, and continuous covered runs.
- The Rain Engine can distinguish known covered, known exposed, and unknown provider state without treating missing cover data as ideal.
- Candidate-based reranking remains the MVP architecture. No custom rain A* is introduced.

## Revisit Conditions

Consider a covered-feature waypoint candidate experiment only if validation shows meaningful mapped covered corridors exist but standard Stage 5 candidates repeatedly miss them. Consider additional public-data adapters only when they provide geometry, access, cover evidence, and provenance that can be normalized behind `CoveredFeatureProvider`.
