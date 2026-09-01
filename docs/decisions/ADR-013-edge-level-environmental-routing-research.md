# ADR-013 — Edge-Level Environmental Routing Research

Date: 2026-08-10
Status: Accepted

## Context

Stage 5 proved that OSRM-backed enhanced candidate generation can create spatially diverse pedestrian alternatives, but Stage 5.7 validation still selected the same Comfort route as the fastest route across the 18-route Minneapolis set. Stage 6 explored whether edge-level environmental routing can create route choices that route-level reranking cannot.

The project must preserve the existing production boundary:

- OSRM remains the production walking route provider for MVP.
- Environmental calculations stay outside React/UI components.
- Provider-specific route and building schemas stay behind normalized interfaces.
- Controlled weather scenarios are research fixtures, not production data.

## Decision

Keep edge-level environmental routing in a research namespace:

```text
lib/routing-research/
scripts/run-stage-6-routing-research.ts
```

The Stage 6 graph is built from normalized OSRM route geometries, not from a new production pedestrian graph. Edges are scored by the existing shade, wind, and comfort engines. Missing edge environmental data is penalized conservatively instead of becoming free or ideal.

Stage 6 does not migrate production routing away from OSRM.

## Validation Result

The Stage 6 runner completed 18 Minneapolis routes across 3 controlled winter scenarios:

- 54 scenario searches
- 0 unrecovered route errors
- Stage 5 selected a route different from fastest in 0 searches
- Stage 6 selected a route different from fastest in 12 searches
- average environmental reduction was about 0.21% to 0.23%
- average runtime was about 36.6 seconds per scenario search

This is enough to validate the research direction, but not enough to justify a production routing migration.

## Consequences

- Stage 5 remains the MVP routing architecture.
- Stage 6 provides a reusable research harness for future edge-cost experiments.
- ComfortOS should not build a production custom routing engine before proving stronger route-quality gains and solving runtime.
- Valhalla should be evaluated before ComfortOS commits to owning production pedestrian graph routing.

## Alternatives Considered

### Proceed With ComfortOS Environmental Router

Rejected for MVP. The POC found some alternate edge paths, but average improvement was too small and runtime too high.

### Keep Stage 5 Forever

Rejected as a permanent conclusion. Edge-level routing can expose choices that route-level reranking cannot, so the research path should remain open.

### Evaluate Valhalla Before Production Router

Accepted as the next architectural comparison if product requirements demand edge-level routing. Valhalla may provide a more production-ready graph and costing foundation than a from-scratch ComfortOS router.
