# Stage 10.1 Production Hardening

Date: 2026-09-02
Status: **IMPLEMENTATION COMPLETE; EXTERNAL BETA RELEASE BLOCKED**

This follow-up addresses the repository-contained P0 work from the Stage 10 readiness audit.
It does not begin Stage 11 and does not override the production evidence rule in the MVP
release checklist.

## Completed Work

- Replaced the browser's direct community raster dependency with server-proxied managed
  Mapbox Static Tiles and retained Mapbox/OpenStreetMap attribution.
- Added production readiness validation for the managed basemap and an identifying National
  Weather Service User-Agent.
- Hardened the building query boundary with bearer authentication, timeouts, bbox limits,
  response-size limits, count limits, private caching, and credential-safe errors.
- Added the equivalent normalized HTTP boundary for optional covered pedestrian features.
- Added immutable Overture data and index checksums at ingestion and verification at load.
- Added a dedicated environment-service container definition and deployment/runbook.
- Added cheap configuration health plus protected, bounded live dependency health.
- Added structured runtime environment/release fields, security response headers, and an
  observability/incident runbook without precise route locations.
- Added consumer privacy, terms, data-source attribution, and support routes. Human legal
  review is deliberately not claimed.
- Split the MapLibre map engine into its own lazy-loaded client chunk so it no longer blocks
  the initial application control bundle.
- Updated React, Vinext, Vite, Cloudflare tooling, and Wrangler to patched compatible
  versions. Runtime dependency audit findings are zero.

## Minneapolis Latency Result

The exact shade result is preserved by filtering only buildings whose projected shadow
bounding box cannot intersect the current route segment. This avoids constructing Turf
shadow polygons for impossible intersections.

| 18-route live profile | Average | p50 | p95 | Max |
| --- | ---: | ---: | ---: | ---: |
| Stage 10 audit baseline | 6,832 ms | 3,624 ms | 21,630 ms | 22,931 ms |
| Stage 10.1 final | 1,032 ms | 634 ms | 2,251 ms | 2,719 ms |

The final run completed 18/18 routes, had zero limited-data results, and stayed below the
12-second UI timeout. Comfort p95 improved by about 89.6 percent and maximum latency by about
88.1 percent. Managed routing usage remained seven requests per search in this validation
profile.

The live weather during this run selected the balanced context and all 18 Comfort results
matched Fastest. That is a valid live outcome, not evidence that controlled winter behavior
changed; the deterministic climate regressions remain the gate for cold behavior.

## Environment Service Evidence

The service loaded a freshly generated Minneapolis Overture `2026-08-19.0` store containing
97,652 buildings. Checksum validation, unauthenticated rejection, authenticated bbox lookup,
and public non-sensitive health all passed.

A local 100-request concurrent burst completed 100/100 requests with p50 31 ms, p95 38 ms,
and max 38 ms. This proves the service path works on the development machine; it is not a
substitute for all-region production memory, ingress, autoscaling, or sustained load tests.

## Verification

- TypeScript typecheck: passed.
- Test suite: 203/203 passed.
- ESLint: passed.
- Vinext production build: passed.
- Managed Mapbox tile request: HTTP 200 image response; token absent from output.
- Runtime dependency audit: zero known vulnerabilities.
- Development-only dependency audit: four moderate findings remain under Drizzle Kit's
  legacy esbuild loader; the automated proposal is a breaking downgrade and was not applied.

## Remaining External Gates

1. Token rotation and dedicated least-privilege production credentials were explicitly
   deferred by the owner. The release therefore remains security-blocked.
2. Deploy the app and private environment service with production secrets, TLS, durable
   versioned Minneapolis/Seattle/Phoenix stores, resource limits, and rollback artifacts.
3. Keep Seattle rain cover unavailable/preview unless a reviewed covered-feature dataset is
   deployed and `REQUIRE_RAIN_COVER=true` passes readiness.
4. Complete human legal review and publish the final policies and monitored support contact.
5. Configure centralized monitoring, quota/billing alerts, alert ownership, retention, and
   the protected live-health schedule.
6. Run production-equivalent all-region capacity, external smoke, cross-browser, mobile,
   accessibility, and rollback rehearsal gates.

## Judgment

The P0 implementation work that can be completed inside this repository is ready. External
beta release approval is still unavailable because the deferred credential work and the
production deployment, legal, monitoring, and final release-candidate evidence are not yet
complete.
