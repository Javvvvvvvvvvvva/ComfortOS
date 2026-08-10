# ADR-009: Stage 5 Candidate Generation v1

Status: Accepted

Date: 2026-08-10

## Context

Stage 4.5 proved that ComfortOS can rerank multiple walking route candidates with the audited raw `RouteComfortCost` contract. It also showed that OSRM alternatives alone are often too similar to prove meaningful comfort differentiation. The next step is better candidate generation, not a custom environmental graph router.

## Decision

ComfortOS adds a `CandidateGenerator` boundary for route candidate generation. The default Stage 5 API path uses a composite generator:

```text
OSRM alternatives
Corridor waypoint candidates
```

The OSRM generator preserves the Stage 4.5 baseline and supports an explicit `osrm-only` comparison mode. The corridor generator creates deterministic waypoint attempts by sampling the fastest route and offsetting those samples left and right in a local meter projection. Each accepted waypoint is passed back to the existing routing service as:

```text
origin -> waypoint -> destination
```

Provider-specific routing responses remain normalized behind the routing provider and routing service boundaries.

## Candidate Bounds

Stage 5 does not analyze every generated route environmentally. Candidates are filtered before shade, wind, and comfort analysis:

- malformed or failed waypoint routes are dropped by the generator
- near-duplicate routes are removed by route overlap
- excessive duration or distance detours are rejected
- candidates with too little unique geometry versus fastest are rejected
- accepted candidates are capped before expensive environmental analysis

The default cap is 5 environmentally analyzed candidates per request.

## Shared Context

Weather and building inputs are request-level context. The comparison service fetches one weather bundle and one union-route building set for the bounded candidate set, then passes those shared normalized inputs into shade and wind analysis. This avoids treating candidate analysis as independent provider fetches and keeps candidate comparisons internally consistent.

## Debug Contract

Route comparison debug output includes generation provenance:

- generation mode
- generated, deduplicated, filtered, and analyzed counts
- rejected candidate reasons
- generator id and waypoint metadata per candidate
- overlap with fastest, unique meters, and maximum lateral separation
- timing for routing, weather, building fetch, shade, wind, comfort, candidate analysis, reranking, and total work

## Consequences

Stage 5 can produce more spatially diverse pedestrian candidates without taking ownership of graph search. It also preserves the Stage 4.5 raw-cost selector, so a generated route only wins when it is comparable, detour-eligible, and meaningfully lower cost.

This is still not custom Comfort routing. There is no A* engine, no edge-cost graph, and no consumer-facing Stay Warm/Dry/Cool mode. Candidate quality remains bounded by the underlying routing provider's ability to route through generated waypoints.
