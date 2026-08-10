# Stage 5 Routing Engine Evaluation

Date: 2026-08-10

## Question

Should ComfortOS move from OSRM-backed candidate generation to a custom comfort-aware graph routing engine now?

## Evaluation

Stage 5 keeps OSRM as the route provider and adds a candidate-generation layer above it. This creates spatially diverse pedestrian candidates by routing through generated corridor waypoints, while preserving the normalized provider boundary and the audited Stage 4.5 raw-cost reranker.

This approach is intentionally conservative:

- OSRM remains responsible for valid pedestrian network routing.
- ComfortOS owns candidate generation policy, filtering, provenance, and reranking.
- Environmental analysis remains route-level, not graph-edge-level.
- The architecture still supports later migration to a custom graph router because route candidates already enter through a provider-neutral interface.

## OSRM-Only Baseline

OSRM-only mode is retained through the composite generator. It is used to compare current Stage 5 behavior against the Stage 4.5 baseline without changing reranking policy.

Observed Stage 4.5 limitation:

- OSRM alternatives are often unavailable or nearly identical.
- When alternatives are similar, raw comfort reranking behaves correctly but has little useful choice.

## Enhanced Candidate Generation

Enhanced mode adds corridor waypoint attempts. The target is candidate diversity, not guaranteed comfort separation. Waypoint candidates can still be rejected when OSRM returns a route that is too similar, too long, malformed, or unavailable.

The first Stage 5 policy choice is to cap expensive analysis and inspect provenance before expanding generation. This avoids turning provider latency into UI instability.

In the local Stage 5 smoke test, enhanced mode generated 7 candidates and analyzed 4. Three corridor candidates had 825 m, 979 m, and 1765 m of unique geometry versus the fastest route, with maximum lateral separation of 95 m, 126 m, and 168 m. This is enough evidence that waypoint generation can create spatial diversity before ComfortOS owns graph search.

The same smoke also showed that public Overpass reliability can dominate end-to-end validation. The service now degrades building-fetch failures into partial non-comparable candidates instead of failing the entire route comparison request.

## Performance Strategy

Stage 5 improves performance characteristics in two ways:

- candidates are filtered before shade, wind, and comfort analysis
- weather and building data are reused across all bounded candidates

The expected bottlenecks are still provider-backed routing and building data, especially public OSRM and Overpass development endpoints.

## Decision

Do not implement custom A* yet.

The next useful milestone is broader live validation of enhanced candidate generation across many city-pair scenarios, then tuning corridor policy and prefilter thresholds. A custom graph engine should wait until there is evidence that provider-routed waypoint candidates cannot produce enough useful candidate diversity.

## Migration Criteria

Reconsider a ComfortOS-owned graph router when at least one of these is true:

- OSRM waypoint candidates consistently fail to produce spatial diversity across validation cities.
- Provider request volume makes enhanced candidate generation unsuitable even with caps.
- ComfortOS has stable edge-level environmental costs that can be cached and queried locally.
- Product modes require explicit optimization objectives such as Stay Warm, Stay Dry, or Stay Cool.
