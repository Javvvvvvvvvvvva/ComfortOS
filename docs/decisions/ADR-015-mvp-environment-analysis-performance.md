# ADR-015 — MVP Environment Analysis Performance

Date: 2026-08-12
Status: Accepted

## Context

Stage 7 productized the MVP route flow by rendering Fastest first and running Comfort analysis in the background. Stage 7.5 measured the remaining latency risk in the Stage 5 production path:

```text
OSRM candidates
shared weather and buildings
shade + wind + comfort
raw-cost reranking
```

The Stage 6 custom router remains research-only.

## Decision

Keep Stage 5 candidate generation for MVP and add performance hardening within existing boundaries:

- high-resolution debug-only stage timing in `ComfortRouteComparisonService`
- `AbortSignal` propagation through route comparison, routing provider calls, and HTTP building fetches
- bounded corridor candidate routing concurrency
- request-scoped candidate-route cache keyed by origin, destination, waypoint, and walking profile
- prepared Wind Engine building context with projected geometry and a lightweight in-memory grid index
- 12 second MVP timeout for background Comfort analysis
- debug-only timing row behind `?debug=routing`

Production route comparison uses:

```text
maxCandidateAttempts: 4
maxConcurrentCandidateRequests: 3
maxEnvironmentAnalyzedCandidates: 5
```

Two attempts were rejected because they reduced comparable candidate count and environmental spread. Three attempts did not improve measured latency in the live run and reduced candidate coverage versus four attempts. Concurrency is bounded; ComfortOS does not use unbounded `Promise.all` over arbitrary provider calls.

## Consequences

- Fastest remains independent and unchanged as the first response path.
- Comfort weights, completeness semantics, comparability, detour policy, and meaningful-improvement threshold are unchanged.
- Prepared wind context keeps `BuildingProvider` unchanged and hides projection/index details inside the Wind Engine.
- Public OSRM remains an external latency variable; self-hosted OSRM or another routing provider should be evaluated before deeper candidate-generation tuning.

## Deferred

No Stage 6 production router, custom A*, Valhalla migration, heat/rain/snow engines, tree canopy, personalization, or model tuning is included in Stage 7.5.
