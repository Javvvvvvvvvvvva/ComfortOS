# ComfortOS Observability Runbook

Date: 2026-09-02

## Runtime Contract

ComfortOS emits one-line JSON server events with service, environment, release, request ID,
provider mode, bounded latency, success state, and non-location counts. The sanitizer rejects
credentials, authorization values, cookies, precise coordinates, origins, and destinations.

Production configuration must set:

```dotenv
COMFORTOS_ENVIRONMENT=production
APP_VERSION=<immutable-release-id>
OBSERVABILITY_PROVIDER=<platform-log-and-metrics-provider>
OBSERVABILITY_ALERTS_CONFIGURED=true
```

`OBSERVABILITY_ALERTS_CONFIGURED=true` is release evidence, not a feature flag. Set it only
after the dashboards, destinations, and incident owner below have been verified.

## Required Signals

| Signal | Source event or endpoint | Initial alert |
| --- | --- | --- |
| Fastest routing failures | `fastest_route_failed` | >5% over 5 minutes |
| Managed routing authorization | routing failure category | any sustained 401/403 |
| Routing quota/rate limit | routing failure category | any 429 burst; provider quota at 80% |
| Comfort failures | `comfort_route_failed` | >5% over 10 minutes |
| Comfort timeout | client timeout event / total latency | >2% over 10 minutes |
| Comfort p95 latency | `comfort_route_complete.latencyMs` | >10 seconds over 15 minutes |
| Weather failures | `weather_failed` | >10% over 10 minutes |
| Building service | `/api/health/live` and service `/health` | two consecutive failures |
| Covered-feature service | `/api/health/live` when required | one failed release probe |
| Basemap | `/api/health/live` | two consecutive failures |
| Full readiness | `/api/health` | any production `not-ready` after deploy |

Tune thresholds only from measured beta traffic. Do not remove alerts merely to make a release
gate pass.

## Dashboards

Maintain separate Fastest and Comfort views. At minimum, chart request count, success rate,
p50/p95/max latency, provider mode, candidate count, managed routing request count, limited-data
rate, building region, and selected climate context. Do not add raw query text or coordinates as
labels, dimensions, breadcrumbs, or log fields.

## Release Verification

1. Deploy the release to staging with an immutable `APP_VERSION`.
2. Confirm `/api/health` is ready for the declared capability profile.
3. Call protected `/api/health/live` and verify routing, NWS, buildings, optional cover, and
   basemap.
4. Generate one synthetic provider failure and one Comfort timeout alert.
5. Confirm the alert reaches the monitored destination and names the incident owner.
6. Inspect raw events to ensure no token, query, address, or precise coordinate appears.
7. Record dashboard and alert evidence in the release checklist.

## Incident Priorities

- P0: credential exposure, incorrect cross-region data, or a route presented from fabricated
  environmental input.
- P1: Fastest unavailable, official alerts suppressed, widespread basemap failure, or required
  capability service unavailable.
- P2: Comfort analysis degradation while Fastest remains available and the UI reports limited
  data honestly.

When a capability service is unreliable, disable its claim and preserve Fastest rather than
silently substituting public demos, fixtures, or another region's data.
