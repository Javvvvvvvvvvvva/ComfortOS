# Self-Hosted Routing POC

Date: 2026-08-16

This POC keeps ComfortOS on the Stage 5 routing architecture:

```text
ComfortOS RoutingService
-> RoutingProvider
-> OSRM-compatible HTTP route API
```

It does not move production code to `lib/routing-research/`, and it does not add environmental edge-cost routing.

## Required Runtime

The current Codex workspace does not have Docker, `osrm-routed`, or `valhalla_service` installed, so the service could not be launched inside this environment. The POC is therefore reproducible configuration plus ComfortOS-side provider switching and benchmark tooling.

Use one of:

- Docker with the official OSRM backend image
- locally installed `osrm-extract`, `osrm-partition`, `osrm-customize`, and `osrm-routed`

## Bounded Metro Extracts

Run one OSRM foot service per validation region during the POC:

| Region | Suggested source extract | ComfortOS endpoint |
| --- | --- | --- |
| Minneapolis | Minnesota OSM PBF extract | `http://127.0.0.1:5001` |
| Seattle | Washington OSM PBF extract | `http://127.0.0.1:5002` |
| Phoenix | Arizona OSM PBF extract | `http://127.0.0.1:5003` |

State extracts are larger than the app validation bbox, but they avoid clipping routes at bbox edges.

## OSRM Build Shape

Example for one region:

```sh
mkdir -p /tmp/comfortos-routing/minneapolis
cd /tmp/comfortos-routing/minneapolis

# Download a current Minnesota .osm.pbf extract from a trusted OSM extract provider.

docker run --rm -t -v "$PWD:/data" osrm/osrm-backend \
  osrm-extract -p /opt/foot.lua /data/minnesota.osm.pbf

docker run --rm -t -v "$PWD:/data" osrm/osrm-backend \
  osrm-partition /data/minnesota.osrm

docker run --rm -t -v "$PWD:/data" osrm/osrm-backend \
  osrm-customize /data/minnesota.osrm

docker run --rm -t -i -p 5001:5000 -v "$PWD:/data" osrm/osrm-backend \
  osrm-routed --algorithm mld /data/minnesota.osrm
```

Repeat with separate ports for Seattle and Phoenix.

## ComfortOS Configuration

Point the app or validation script at a specific region service:

```sh
ROUTING_PROVIDER=osrm-self-hosted \
ROUTING_OSRM_BASE_URL=http://127.0.0.1:5001 \
ROUTING_REQUEST_TIMEOUT_MS=8000 \
npm run routing:benchmark -- --limit 6 --concurrency 1,2,4 --output /tmp/comfortos-routing-benchmark-minneapolis.json
```

Production must not use the public demo silently. In production, `ROUTING_PROVIDER=osrm-public` throws unless `ROUTING_ALLOW_PUBLIC_DEMO_IN_PRODUCTION=true` is deliberately set for a non-MVP research run.

## Health Check

The app exposes:

```text
GET /api/routes/routing-health
```

It returns provider metadata, configured mode, readiness, and probe latency.

## Acceptance Target

A self-hosted provider is acceptable for Stage 9.5 only after:

- the health endpoint is `ready`
- Minneapolis, Seattle, and Phoenix routing benchmarks complete against configured self-hosted endpoints
- benchmark p95 and failure counts are documented
- route geometry hashes are stable enough across repeat runs to support validation

Until then, routing infrastructure remains an MVP blocker even if public OSRM happens to work.

## Relationship To Managed Routing

Stage 9.6 implements Mapbox Directions walking as the first managed-provider POC. A
successful managed validation removes Docker installation from the immediate MVP gate;
it does not remove the self-hosted option.

Revisit self-hosted OSRM when one or more of these become material:

- managed request volume moves beyond the useful free/low-cost pricing bands
- provider terms or rate limits constrain the bounded candidate-request pattern
- ComfortOS needs tighter p95 latency, regional capacity, graph update, or outage control
- a second production-approved provider is needed for deliberate failover
- route-equivalence audits show a pedestrian-network quality advantage worth operating

The crossover is operational, not a single hard-coded request number. Use measured
requests per consumer search, current provider pricing, service staffing/monitoring cost,
and the three-city latency matrix before deciding.
