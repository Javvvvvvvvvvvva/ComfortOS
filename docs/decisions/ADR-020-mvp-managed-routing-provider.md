# ADR-020 - MVP Managed Routing Provider

Date: 2026-08-16
Status: Accepted

## Context

Stage 9.5 concluded that ComfortOS was not ready for Stage 10 because public FOSSGIS OSRM
could not provide repeatable production walking-routing availability. Environmental
engines, real data, and progressive UX were already validated, but the Minneapolis,
Seattle, and Phoenix matrix required a production-eligible provider.

The accepted Stage 5 architecture must remain provider-independent, preserve waypoint
candidate generation, and keep Stage 6 custom routing research-only.

## Decision

ComfortOS selects Mapbox Directions API v5 with `mapbox/walking` as the MVP managed
walking-routing provider.

Production configuration is:

```text
ROUTING_PROVIDER=mapbox-managed
MAPBOX_ACCESS_TOKEN=<server-side token>
```

The `MapboxWalkingRoutingProvider` converts vendor responses into normalized
`RouteResult` and `RouteCandidateSet` models. Provider response types do not leave the
adapter.

The request architecture remains:

```text
RoutingProvider Fastest request
-> provider alternatives
-> corridor waypoint requests
-> normalization/deduplication/filtering
-> environmental analysis
-> raw-cost Comfort reranking
```

Four corridor attempts remain the MVP default. Provider alternatives are supplementary.

## Validation Evidence

Stage 9.6 established:

- real health status `ready`
- 54/54 three-city routing benchmark searches successful
- 61 ms average and 112 ms p95 Fastest retrieval
- 272/272 climate route comparisons successful
- Minneapolis live and three controlled winter suites complete
- Seattle general and cover-rich rain suites complete
- Phoenix full live, four controlled heat, shade-rich, and time-of-day suites complete
- real waypoint candidate generation with five candidates/search under the default policy
- nine-route pedestrian plausibility audit without an obvious invalid crossing or shortcut
- normalized request accounting and pricing analysis
- production fixture boundary and token-leak audits clean

The detailed evidence is in
`docs/analysis/STAGE_9_6_MANAGED_ROUTING_VALIDATION.md`.

## Operational Limits

- Walking requests support at most 25 coordinates; ComfortOS currently uses three.
- The documented default Directions limit is 300 requests/minute/token.
- The provider is not treated as time-dependent for walking. `departureTime` continues to
  control environmental timing, not the Mapbox walking graph.
- The current progressive flow uses up to seven managed Directions requests per consumer
  search with four corridor attempts.
- Provider failure returns normalized unavailability. There is no public OSRM fallback.

## Token Handling

`MAPBOX_ACCESS_TOKEN` is server-side environment configuration only. It must not appear in
metadata, health responses, debug payloads, errors, logs, validation artifacts, source
control, or client bundles. Missing or syntactically invalid configuration fails before
network access; 401/403 responses remain explicit authorization failures.

Deployment should use a dedicated restricted token with rotation and quota monitoring.

## Pricing Implications

At the current maximum seven requests/search, 100,000 consumer searches/month produce
approximately 700,000 Directions requests. Based on pricing reviewed on 2026-08-16, the
rough tiered estimate is $1,120/month after the first 100,000 free requests. Pricing is
analysis-only and must not be embedded in routing logic.

## Consequences

- ComfortOS can complete production-like walking validation without public OSRM.
- Provider availability is no longer the blocker for the three-climate MVP.
- Mapbox becomes an operational dependency with credential, quota, billing, and terms
  management.
- The existing provider abstraction and candidate architecture remain unchanged.
- Stage 6 custom routing remains research-only.
- Full Comfort latency still has an environmental-analysis heavy tail, especially on long
  Minneapolis routes; this is tracked separately from provider suitability.

## Alternatives Considered

### Public FOSSGIS OSRM

Retained for explicit low-volume development/audit use only. It is not production eligible
and cannot be a fallback.

### Self-Hosted OSRM

Remains the closest migration path because the normalized provider architecture already
supports an explicit self-hosted endpoint. Reconsider when managed cost, provider policy,
graph control, or latency control justifies operating routing infrastructure.

### Valhalla

Remains a future option for multimodal routing or richer runtime costing. No migration is
accepted in Stage 9.6.

## Revisit Triggers

Revisit this decision when any of the following becomes material:

- managed request cost approaches self-hosted operating cost
- walking-route quality regresses in supported regions
- quota or provider restrictions prevent the required candidate architecture
- multimodal or dynamic edge-cost routing becomes an MVP requirement
- an approved second production provider is needed for normalized failover
