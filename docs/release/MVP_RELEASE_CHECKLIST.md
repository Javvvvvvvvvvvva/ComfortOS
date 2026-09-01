# ComfortOS Limited MVP Release Checklist

Date: 2026-08-16
Release state: **Blocked pending P0 items**
Target shape: one primary capability region with Minneapolis, Seattle, and Phoenix presented
as explicitly limited beta/preview regions according to deployed capabilities.

This is an operational gate, not a list of work that is assumed complete. Check an item only
from production evidence.

## P0 Release Gates

### Secrets And Security

- [ ] Revoke/rotate the managed-routing token that was previously pasted into a conversation.
- [ ] Create a dedicated production Mapbox token with minimum required scopes and appropriate
  URL/application restrictions where supported.
- [ ] Verify the old token is rejected and the new token passes one walking health request.
- [x] Keep `.env.local` ignored and untracked.
- [x] Keep only placeholders in `.env.example`.
- [x] Confirm repository and reachable Git history scans contain no Mapbox token pattern.
- [x] Confirm API/debug payloads, structured logs, screenshots, fixtures, and audit artifacts
  do not expose a credential.
- [ ] Configure billing/quota alerts and an incident owner for the managed routing account.

### Production Dependencies

- [ ] Set `ROUTING_PROVIDER=mapbox-managed` and the rotated token in production secrets.
- [ ] Replace `photon.komoot.io` with a managed geocoder or capacity-tested self-hosted Photon.
- [ ] Replace `tile.openstreetmap.org` with a production tile/style provider or self-hosted
  tile service while retaining required attribution.
- [ ] Set a valid identifying `WEATHER_USER_AGENT` with monitored contact information.
- [ ] Deploy the building query service on durable, immutable, versioned storage.
- [ ] Deploy and activate the three reviewed Overture region stores through an active manifest.
- [ ] Deploy a worker-compatible covered-feature provider before claiming broad Seattle
  `Stay Dry` capability; otherwise mark rain cover unavailable and Seattle as preview.
- [ ] Require private service access/TLS, bbox limits, timeouts, and payload limits for the
  building and cover services.
- [ ] Make `/api/health` return `ready` in the production environment.
- [ ] Pass the live routing health endpoint with managed Mapbox metadata and no public OSRM
  fallback.

### Performance And Reliability

- [ ] Bring common Minneapolis full Comfort requests below the 12-second UI timeout, or
  narrow the primary launch geography/routes so no common supported path exceeds it.
- [ ] Re-run the 18-route Minneapolis profile and record average/p50/p95/max plus stage
  breakdown after the result-preserving fix.
- [ ] Load/capacity test the building service with all active stores and production memory
  limits.
- [ ] Verify Fastest remains available when weather, buildings, cover, or Comfort analysis
  fails or times out.
- [ ] Verify unsupported regions return zero comparable environmental candidates and never
  borrow another region's data.
- [ ] Run the Stage 10 smoke suite against the release candidate.

### Legal, Privacy, And Safety

- [ ] Publish a legally reviewed Privacy Policy.
- [ ] Publish legally reviewed Terms of Use.
- [ ] Publish a consumer-visible data attribution/source page covering OSM, Overture, NWS,
  Mapbox, the geocoder, and basemap provider.
- [ ] Add a monitored contact/support route.
- [ ] Review hosting and provider location-data retention; configure app/platform log
  redaction and retention.
- [x] Keep the environmental-estimate disclaimer in the route result.
- [x] Keep official NWS alerts separate, assertive, and above ordinary route recommendations.
- [x] Avoid safety certification, WBGT, flood-safety, and medical-risk claims.

## P1 Before External Beta Expansion

- [ ] Add centralized error monitoring and alerts for routing, weather, buildings, cover,
  engine failures, and Comfort timeouts without precise coordinates.
- [ ] Validate current Safari/WebKit and Firefox; the Stage 10 visual run covered Chromium
  only.
- [ ] Complete a manual screen-reader pass with VoiceOver and a full keyboard-only route flow.
- [ ] Test location permission allow, deny, unavailable, and retry states on real mobile
  devices.
- [ ] Add automated API tests for stale/cancelled route requests and the 12-second UI timeout.
- [ ] Document supported browser versions and offline/no-network behavior in support copy.
- [ ] Validate production bundle/chunk sizes and lazy-load or exclude debug-only surfaces if
  they materially affect the first route interaction.
- [ ] Establish an on-call/incident process and dashboards for latency, errors, quota, and
  building service health.
- [ ] Decide the initial primary capability region from post-fix production data. Current
  recommendation is Phoenix primary, with Minneapolis and Seattle explicitly previewed.

## Product Scope

- [x] Launch core is Map, Search, Fastest, contextual Comfort result, route explanation, and
  official alerts.
- [x] Active Navigation is hidden until real GPS route progress exists.
- [x] Future Departure is hidden until real forecast-time recomputation is complete.
- [x] Comfort Map remains debug-only until the visualization is consumer-ready.
- [x] Manual search remains available when geolocation is denied.
- [x] Equal Fastest/Comfort state is treated as a valid `Best choice right now` result.
- [x] New visitors without an origin are not shown Minneapolis weather as if it were local.

## Data Release Gate

- [ ] Record immutable app version and active environment-data manifest version.
- [ ] Verify every store checksum and manifest source/release/license metadata.
- [ ] Run provider bbox and unsupported-bbox tests.
- [ ] Run deterministic cold/rain/heat regression tests.
- [ ] Run live Minneapolis, Seattle, Phoenix, and unsupported-region smoke cases.
- [ ] Record context, candidate count, comparable count, completeness, latency, and failures.
- [ ] Compare route-selection and completeness deltas with the previous data release.
- [ ] Keep the previous active data manifest available for rollback.

## Build And Browser Gate

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `git diff --check`
- [ ] Mobile widths: 320x568, 375x812, 390x844, 430x932, plus desktop.
- [ ] Chrome/Chromium, Safari/WebKit, and Firefox current versions.
- [ ] Search results, keyboard-open state, route comparison, alerts, Limited Data, and long
  labels have no overlap or horizontal overflow.
- [ ] Visible keyboard focus, semantic controls, live-region behavior, and contrast pass.

## Deployment And Rollback

- [ ] Deploy to staging with production-equivalent provider configuration.
- [ ] Confirm cheap readiness and bounded live routing health.
- [ ] Smoke all claimed capability regions from outside the developer network.
- [ ] Verify log redaction using synthetic identifiers and locations.
- [ ] Verify quota/billing, uptime, and latency alerts.
- [ ] Activate the release gradually for a bounded beta cohort.
- [ ] Record rollback owners and commands for app version, provider configuration, and active
  data manifest.
- [ ] Rehearse one app rollback and one data-manifest rollback.

## Stage 10 Baseline Evidence

- [x] Managed routing benchmark: 9/9 successful, five candidates/search, no public OSRM
  fallback.
- [x] Four-region smoke: Minneapolis, Seattle, Phoenix, and unsupported Chicago passed.
- [x] Minneapolis 18-route profile completed after production debug collections were removed.
- [x] Unsupported building-region fallback defect fixed and regression-tested.
- [x] `RegionCapabilities` uses evidence/capability quality rather than city names.
- [x] Structured location-safe logs and combined configuration readiness endpoint added.
- [x] Stage 10 climate regression suite added.
- [x] NWS station observation wind units normalized and the full Minneapolis/Phoenix live
  suites rerun after the correction.

Release approval remains unavailable until every P0 item is checked and the release-candidate
build/browser gate is rerun in the production-equivalent environment.
