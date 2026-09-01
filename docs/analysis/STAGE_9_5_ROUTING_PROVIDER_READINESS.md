# Stage 9.5 — Routing Provider Readiness

Date: 2026-08-16

## Conclusion

ROUTING PROVIDER STRATEGY IMPLEMENTED; SELF-HOSTED POC NOT EXECUTABLE IN THIS WORKSPACE; NOT READY FOR MVP ROUTING INFRASTRUCTURE.

Stage 9.5 separates public routing-provider availability from environmental engine validation. Public OSRM outage is no longer allowed to masquerade as Heat, Rain, Shade, Wind, Comfort, or reranking failure.

Implemented:

- explicit routing provider configuration
- public-demo / self-hosted / managed provider metadata
- production guard against silent public-demo fallback
- routing health endpoint
- route-comparison debug provider metadata
- routing-only benchmark script for Minneapolis, Seattle, and Phoenix
- self-hosted OSRM POC runbook
- ADR-019

Not implemented:

- production custom routing
- Stage 6 research migration
- Valhalla adapter
- Heat Engine or Comfort Engine model changes

## Provider Audit

### Public FOSSGIS OSRM

FOSSGIS documents the public routing service as volunteer/donation-funded infrastructure with explicit routing-server limits, including a maximum of one request per second and no availability guarantee. The route-comparison candidate path can exceed that shape even with bounded concurrency, so this provider is development-only.

Sources:

- https://routing.openstreetmap.de/about.html
- https://fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/

### Self-Hosted OSRM

Self-hosted OSRM is the lowest-risk compatibility option because ComfortOS already consumes the OSRM route API through `OsrmWalkingProvider`. It preserves Stage 5 candidate generation and only changes deployment/configuration. It still requires OSM extract updates, pedestrian profile validation, monitoring, and capacity planning.

Source:

- https://github.com/Project-OSRM/osrm-backend/blob/master/docs/http.md

### Valhalla

Valhalla remains the strongest future bridge toward environmental edge-cost routing because it supports pedestrian costing and runtime costing options. Stage 9.5 does not migrate to Valhalla because that would require a new provider adapter and fresh validation matrix.

Sources:

- https://github.com/valhalla/valhalla
- https://github.com/valhalla/valhalla-docs/blob/master/turn-by-turn/api-reference.md

### Managed Routing

Mapbox Directions supports a walking profile and production quota/billing model. It may be a practical MVP alternative if a managed provider is preferred over operating OSRM. It would require a normalized adapter and token/billing controls.

Sources:

- https://docs.mapbox.com/api/navigation/directions/
- https://www.mapbox.com/pricing

## Code Changes

Routing provider config:

```text
ROUTING_PROVIDER=osrm-public | osrm-self-hosted | osrm-managed
ROUTING_OSRM_BASE_URL=<provider base URL>
ROUTING_REQUEST_TIMEOUT_MS=8000
```

Production guard:

```text
NODE_ENV=production ROUTING_PROVIDER=osrm-public
```

throws unless `ROUTING_ALLOW_PUBLIC_DEMO_IN_PRODUCTION=true` is explicitly set.

Health endpoint:

```text
GET /api/routes/routing-health
```

Benchmark:

```text
npm run routing:benchmark -- --limit 6 --concurrency 1,2,4 --output /tmp/comfortos-routing-benchmark.json
```

Self-hosted runbook:

```text
docs/development/SELF_HOSTED_ROUTING_POC.md
```

## Self-Hosted POC Attempt

Runtime check in this workspace:

```text
docker --version
command -v osrm-routed
command -v valhalla_service
```

Result:

```text
docker: command not found
osrm-routed: not found
valhalla_service: not found
```

Because no routing engine runtime is installed here, no self-hosted OSRM or Valhalla service was launched. The POC is therefore prepared but not validated.

## Validation Matrix Status

Required matrix:

| City | Requirement | Status |
| --- | --- | --- |
| Minneapolis | self-hosted or managed routing benchmark | BLOCKED: no local routing runtime |
| Seattle | self-hosted or managed routing benchmark | BLOCKED: no local routing runtime |
| Phoenix | self-hosted or managed routing benchmark | BLOCKED: no local routing runtime |

The Stage 9 public-OSRM partial Phoenix result remains useful environmental evidence, but it is not enough for MVP routing readiness.

Public-demo reachability probe:

```text
npm run routing:benchmark -- --limit 1 --concurrency 1 --output /tmp/comfortos-stage-9-5-public-routing-benchmark.json
```

Result:

| Provider | Health | Searches | Successes | Failures |
| --- | --- | ---: | ---: | ---: |
| FOSSGIS public OSRM foot demo | unavailable | 3 | 0 | 3 |

This confirms the Stage 9 outage is still an external routing-provider availability issue, not an environmental engine failure.

## Benchmark Acceptance Criteria

Before Stage 10:

- `/api/routes/routing-health` returns `ready`
- three-city `npm run routing:benchmark` succeeds against self-hosted or managed routing
- concurrency 1 / 2 / 4 results are documented
- failure count is zero or explicitly attributable to route topology, not provider availability
- Stage 8/8.5/9 validation can rerun without public OSRM dependency

## Final Readiness

`NOT READY FOR STAGE 10`.

ComfortOS is now architecturally ready to switch providers, but MVP routing infrastructure is not accepted until a production-eligible provider passes the Minneapolis, Seattle, and Phoenix matrix.

## Stage 9.6 Follow-Up

Stage 9.6 selected Mapbox Directions API v5 with `mapbox/walking` as the first
managed-provider POC and implemented it behind the existing `RoutingProvider` boundary.
Configuration is:

```text
ROUTING_PROVIDER=mapbox-managed
MAPBOX_ACCESS_TOKEN=<dedicated valid token>
```

The adapter, provider-neutral candidate path, health behavior, request accounting, and
benchmark tooling were subsequently validated with a real credential. Mapbox passed real
health, route-equivalence, pedestrian plausibility, waypoint candidate generation, and the
complete Minneapolis / Seattle / Phoenix matrix with zero routing failures.

Stage 9.5's provider blocker is resolved. See
`docs/analysis/STAGE_9_6_MANAGED_ROUTING_VALIDATION.md`.

Current status:

```text
THREE-CLIMATE MVP VALIDATED
```

ADR-020 accepts Mapbox Directions walking as the MVP managed provider. Stage 10 was not
started automatically.
