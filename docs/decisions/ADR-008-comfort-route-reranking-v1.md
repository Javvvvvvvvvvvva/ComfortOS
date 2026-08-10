# ADR-008: Stage 4.5 Comfort Route Reranking v1

Date: 2026-08-10
Status: Accepted

## Context

Stage 4 produced an audited Comfort Engine and raw route-cost contract. Stage 4.5 is the first stage where multiple walking route candidates may be compared, but custom environmental graph routing remains out of scope.

The goal is to validate reranking behavior, not candidate generation.

## Decision

ComfortOS uses OSRM walking alternatives as the Stage 4.5 candidate source. The `RoutingProvider` boundary now supports normalized `RouteCandidateSet` output while preserving the existing fastest-route API.

Each deduplicated candidate is analyzed through the same audited environmental pipeline:

```text
OSRM route candidate
  -> ShadeAnalysisService
  -> WindAnalysisService
  -> ComfortAnalysisService
  -> raw RouteComfortCost
  -> reranking selector
```

The Comfort route is selected only from candidates whose `routeComfortCost.comparable` is true. Raw `environmentalExposureCost` drives selection. Rounded `comfortScore` is display-only and is never used for route choice.

## Detour Policy

The default Stage 4.5 policy is:

```text
max extra duration: 5 minutes
max extra duration ratio: 35%
max extra distance ratio: 35%
minimum raw environmental cost reduction: 8%
```

Fastest is always independently identifiable. If no candidate is comparable, detour-eligible, and meaningfully lower-cost, the Comfort route is the Fastest route.

## Meaningful Improvement

A separate Comfort route requires at least 8% lower raw environmental exposure cost than Fastest. This prevents UI churn where every tiny raw-cost difference becomes a different route recommendation.

## Candidate Deduplication

OSRM alternatives can be nearly identical. Stage 4.5 computes a development `routeOverlapRatio` using rounded route-edge signatures plus route-length similarity. Candidates with overlap at or above `0.92` are deduplicated.

This is a deterministic development heuristic, not a final graph-isomorphism algorithm.

## Failure Isolation

Shade, wind, and comfort analysis failures are isolated per candidate. A candidate with missing required dimensions remains visible to debug output as partial but cannot win Comfort reranking.

Normal responses strip heavy environmental debug geometries unless explicitly requested by the client.

## Consequences

- Comfort reranking now has a real normalized route comparison model.
- Stage 4.5 can return Fastest-only behavior when OSRM has no useful alternative or the alternative is not meaningfully better.
- Completeness protects route comparison from the Stage 4 failure mode where missing environmental dimensions looked like perfect comfort.
- Live provider latency is now visible in debug timing fields.

## Deferred

Custom A*, GraphHopper custom models, Valhalla costing, Climate DNA route names, Stay Warm/Dry/Cool, rain routing, AQI routing, snow routing, tree routing, personalization, and ML/LLM routing remain out of scope.

Future environmental routing should reuse the raw cost contract and selector policy, but generate candidates from ComfortOS-owned edge costs rather than relying on OSRM alternatives.
