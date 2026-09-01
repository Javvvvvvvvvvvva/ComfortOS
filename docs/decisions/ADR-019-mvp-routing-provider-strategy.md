# ADR-019: MVP Routing Provider Strategy

Date: 2026-08-16

## Context

Stage 9 validated Heat Engine behavior and Phoenix building data, but route validation was interrupted by the public OSRM endpoint becoming unreachable. That failure must not be interpreted as a Heat Engine, Comfort Engine, or candidate-reranking failure.

ComfortOS needs to remove public routing-provider availability as a blocker for environmental engine validation while preserving the accepted `KEEP STAGE 5 FOR MVP` architecture.

## Decision

ComfortOS keeps the Stage 5 production routing architecture:

```text
RoutingService
-> RoutingProvider
-> configured normalized walking route API
-> CandidateGenerator reranking
```

Stage 6 remains research-only under `lib/routing-research/`.

Routing provider configuration is now explicit:

- `ROUTING_PROVIDER=osrm-public`
- `ROUTING_PROVIDER=osrm-self-hosted`
- `ROUTING_PROVIDER=osrm-managed`
- `ROUTING_PROVIDER=mapbox-managed`

Production runtime must not silently fall back to the public demo provider. `osrm-self-hosted` and `osrm-managed` require an explicit `ROUTING_OSRM_BASE_URL` or `ROUTING_BASE_URL`.

`mapbox-managed` requires `MAPBOX_ACCESS_TOKEN` and uses a dedicated adapter. Missing or
invalid credentials fail explicitly. This configuration support does not accept Mapbox as
the MVP provider until the Stage 9.6 live validation matrix passes.

The public FOSSGIS OSRM foot service remains acceptable for local development and low-volume prototype checks only. It is not MVP production infrastructure.

## Provider Options

### Public FOSSGIS OSRM

Useful for development because it is OSRM-compatible and requires no account. Not production eligible because the FOSSGIS terms limit routing services to one request per second and do not guarantee availability. The public about page also identifies it as a public routing service with usage limits.

Sources:

- https://routing.openstreetmap.de/about.html
- https://fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/

### Self-Hosted OSRM

Best near-term compatibility upgrade. ComfortOS can keep the current provider adapter and swap only `ROUTING_OSRM_BASE_URL`. It improves control over capacity, concurrency, graph update cadence, and validation repeatability, but requires an extract/update/monitoring pipeline.

Source:

- https://github.com/Project-OSRM/osrm-backend/blob/master/docs/http.md

### Managed OSRM-Compatible Provider

Operationally attractive if it supplies walking routes, alternatives or waypoint routing, documented quotas, observability, and acceptable data terms. Requires a provider adapter or OSRM-compatible URL contract.

### Valhalla

Architecturally important for future edge-cost routing because it supports runtime costing concepts and pedestrian costing. It is not a Stage 9.5 production migration because it requires a new provider implementation and validation suite.

Sources:

- https://github.com/valhalla/valhalla
- https://github.com/valhalla/valhalla-docs/blob/master/turn-by-turn/api-reference.md

### Mapbox Directions

Viable managed option for walking routes and quota-backed production service. It introduces billing, token management, provider terms, and a non-OSRM response adapter.

Sources:

- https://docs.mapbox.com/api/navigation/directions/
- https://www.mapbox.com/pricing

## Consequences

- Routing readiness is now inspectable through `GET /api/routes/routing-health`.
- Route comparison debug output includes routing provider metadata.
- Public routing failures are classified as provider unavailability instead of environmental analysis failures.
- Candidate concurrency remains bounded.
- The self-hosted OSRM POC is documented in `docs/development/SELF_HOSTED_ROUTING_POC.md`.
- Stage 9.5 does not change Heat Engine weights, Rain Engine weights, Comfort Engine selection semantics, or Stage 6 research isolation.

## Current Readiness

`NOT READY FOR MVP ROUTING INFRASTRUCTURE`.

The code now supports explicit self-hosted or managed routing configuration, but this Codex workspace lacks Docker, `osrm-routed`, and `valhalla_service`, so a real self-hosted service could not be launched and the Minneapolis / Seattle / Phoenix validation matrix could not be completed against controlled routing infrastructure.

Stage 10 should not begin until one of these is true:

- self-hosted OSRM passes the three-city benchmark and route validation matrix
- a managed provider passes the same matrix behind the provider boundary

## Stage 9.6 Resolution

Mapbox Directions API v5 with `mapbox/walking` subsequently passed the full Stage 9.6
managed-provider matrix. ADR-020 accepts it as the MVP managed walking provider.

This resolution supersedes the readiness block above, but not this ADR's provider
abstraction, public-provider prohibition, self-hosted OSRM option, or Stage 6 isolation.
