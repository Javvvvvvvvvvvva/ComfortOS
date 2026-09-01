# Stage 9.6 - Managed Routing Provider Validation

Date: 2026-08-16

> **Stage 10 correction notice (2026-08-16):** NWS station observation wind quantities with
> `wmoUnit:km_h-1` were being treated as m/s. Stage 10 added unit-aware normalization and
> reran the live Minneapolis and Phoenix 18-route suites. Managed-routing success,
> provider/candidate validation, and controlled scenarios in this report remain valid;
> quantitative live wind/Comfort metrics that depended on station observations are
> superseded by `STAGE_10_MVP_READINESS_AUDIT.md`.

## Final Judgment

```text
THREE-CLIMATE MVP VALIDATED
```

Mapbox Directions API v5 with `mapbox/walking` passed real health, waypoint,
candidate-generation, route-quality, latency, request-accounting, and three-city
integration validation behind the existing `RoutingProvider` boundary. Across the final
climate matrix, 272 of 272 route comparisons completed without a routing failure.

Stage 10 was not started. No environmental engine or Comfort weight changed.

## 1. Managed Provider Selected

The MVP managed provider is:

```text
provider: Mapbox
mode: managed
profile: walking
endpoint family: Directions API v5
normalized id: mapbox-directions-walking
```

This is an MVP operational decision, not permanent vendor lock-in. The normalized provider
boundary, self-hosted OSRM option, and future Valhalla option remain intact.

## 2. Integration Architecture

```text
ROUTING_PROVIDER=mapbox-managed
MAPBOX_ACCESS_TOKEN (server-side only)
-> createConfiguredRoutingProvider
-> MapboxWalkingRoutingProvider
-> RouteResult / RouteCandidateSet
-> RoutingService
-> ProviderAlternativeGenerator + CorridorWaypointGenerator
-> environmental analysis
-> raw-cost Comfort reranking
```

Mapbox response types do not leave the adapter. React, environmental engines, candidate
filtering, and reranking do not branch on Mapbox.

No automatic failover was added. Public OSRM cannot become a consumer fallback.

## 3. Credentials And Configuration

Required:

```text
ROUTING_PROVIDER=mapbox-managed
MAPBOX_ACCESS_TOKEN=<dedicated Mapbox token>
```

Optional:

```text
ROUTING_REQUEST_TIMEOUT_MS=8000
MAPBOX_DIRECTIONS_BASE_URL=https://api.mapbox.com/directions/v5
MAPBOX_WALKWAY_BIAS=0
```

The real credential is stored only in ignored `.env.local`. It is not present in tracked
or untracked non-environment project files, normalized metadata, health output, validation
artifacts, errors, debug output, or this report. `.gitignore` excludes `.env*`.

## 4. Provider Health And Security Result

The first unrestricted real walking health request returned:

| Field | Result |
| --- | --- |
| HTTP/provider result | ready |
| Health latency | 279 ms |
| Provider | Mapbox |
| Mode | managed |
| Profile | walking |
| Endpoint | Directions API v5 |
| Production eligible | true |
| Credential in serialized result | no |

Subsequent benchmark probes completed in 111-163 ms. Missing credentials still fail before
network access. Unauthorized, rate-limit, server, timeout, caller-cancellation, and no-route
states remain normalized. Managed failure does not fabricate geometry.

## 5. Walking And Waypoint Compatibility

The official walking profile was used for every managed request. The current corridor
request shape is:

```text
origin + one corridor waypoint + destination = 3 coordinates
Mapbox walking maximum = 25 coordinates
```

All candidate benchmarks returned five normalized candidates with the four-attempt policy:
one provider/fastest route plus four valid corridor candidates after normalization and
deduplication. Waypoint order and snapped endpoint semantics remained compatible with the
existing CandidateGenerator.

Provider alternatives are supplementary. Candidate generation does not depend on Mapbox
returning multiple native alternatives.

## 6. Route Equivalence And Pedestrian Plausibility

The repository did not retain a historical normalized OSRM geometry snapshot. An explicit
nine-request `osrm-public` audit snapshot was therefore frozen immediately before the
managed audit. That mode was used only to create comparison evidence; it was never enabled
as a consumer fallback or production provider.

| City | Route | Distance delta | Duration delta | Geometry overlap | Automatic | Visual audit |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Minneapolis | downtown-riverfront | +1.2% | -10.6% | 0.610 | pass | pass |
| Minneapolis | downtown-university | -0.7% | -10.9% | 0.632 | warning | pass |
| Minneapolis | north-loop-downtown | +1.6% | -7.1% | 0.347 | pass | pass |
| Seattle | pike-place-slu | +7.8% | -3.4% | 0.543 | pass | pass |
| Seattle | waterfront-pioneer-square | -1.0% | -8.0% | 0.748 | pass | pass |
| Seattle | belltown-westlake | +3.8% | -6.0% | 0.291 | pass | pass |
| Phoenix | phx-01 | -4.5% | -12.7% | 0.364 | pass | pass |
| Phoenix | phx-02 | +0.1% | -9.4% | 0.384 | pass | pass |
| Phoenix | phx-03 | +0.5% | -12.1% | 0.646 | pass | pass |

The Minneapolis warning was one 321 m geometry segment against a 300 m heuristic. The
streets-basemap overlay showed the segment following a connected mapped crossing/path, not
a disconnected shortcut. All nine overlays were checked for rivers, bridges, highway
crossings, pedestrian paths, parks, and discontinuities. No obvious pedestrian regression
was found. Endpoint snapping remained below 29 m for all nine routes.

## 7. Three-City Routing Benchmark

The standard benchmark used six OD pairs per city at concurrency 1, 2, and 4.

| Metric | Result |
| --- | ---: |
| Searches | 54 |
| Success | 54 |
| Failures | 0 |
| Success rate | 100% |
| Managed requests | 324 |
| Candidates/search | 5 |

Fastest routing:

| Scope | Average | Median | p95 | Max |
| --- | ---: | ---: | ---: | ---: |
| All cities | 61 ms | 43 ms | 112 ms | 197 ms |
| Minneapolis | 71 ms | 44 ms | 163 ms | 197 ms |
| Seattle | 59 ms | 42 ms | 110 ms | 111 ms |
| Phoenix | 55 ms | 43 ms | 89 ms | 111 ms |

Full routing candidate generation across the mixed concurrency run averaged 228 ms,
with 122 ms median, 533 ms p95, and 716 ms max. At concurrency 4 it averaged 77 ms.

## 8. Provider Validation Matrix

| City | Searches | Success | Failures | Contextual route comparison complete |
| --- | ---: | ---: | ---: | --- |
| Minneapolis | 72 | 72 | 0 | yes |
| Seattle | 78 | 78 | 0 | yes; rain capability remains coverage-dependent |
| Phoenix | 122 | 122 | 0 | yes |
| **Total** | **272** | **272** | **0** | **yes** |

These runs issued 1,704 managed routing requests. No 401, 403, 429, timeout, no-route, or
provider-unavailable result occurred.

## 9. Minneapolis Live Results

| Metric | Result |
| --- | ---: |
| Searches | 18 |
| Success / failures | 18 / 0 |
| Live context | Balanced 18 |
| Comfort different / same | 0 / 18 |
| Limited Data | 0 |
| Fastest average / p95 / max | 81 / 163 / 252 ms |
| Full Comfort average / p95 / max | 9,028 / 35,156 / 38,468 ms |
| Managed requests/search | 7 |

Live NWS inputs were used. The separate progressive Fastest request is included in the
seven-request accounting.

## 10. Minneapolis Controlled Winter Results

| Scenario | Success | Cold context | Stay Warm different / same | Limited Data | Fastest avg | Comfort avg |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| WINTER_NW_STRONG | 18/18 | 18 | 0 / 18 | 0 | 71 ms | 8,546 ms |
| WINTER_WEST_MODERATE | 18/18 | 18 | 0 / 18 | 0 | 70 ms | 8,427 ms |
| WINTER_CALM | 18/18 | 18 | 0 / 18 | 0 | 72 ms | 8,479 ms |

The production Stage 5 provider/candidate architecture was used. Stage 6 custom routing
was not imported. The zero rerank result is retained honestly; no weights were changed to
manufacture a different route.

## 11. Seattle General Rain Results

Across three controlled scenarios, the general sample completed 54/54 searches with no
routing failure. Six of 18 routes per scenario had sufficient route-accessible cover data
to activate Stay Dry. All 54 selected Fastest, reflecting sparse route-accessible cover in
the general network rather than routing failure.

Average full Comfort latency by scenario was 2,604 ms (`RAIN_LIGHT`), 2,551 ms
(`RAIN_HEAVY_WINDY`), and 2,489 ms (`RAIN_CALM`). Managed request count was six/search.

## 12. Seattle Cover-Rich Results

| Scenario | Success | Stay Dry capable | Different / same | Avg rain reduction | Avg extra time |
| --- | ---: | ---: | ---: | ---: | ---: |
| RAIN_LIGHT | 8/8 | 7 | 1 / 7 | 18.3% | 18.2 s |
| RAIN_HEAVY_WINDY | 8/8 | 7 | 1 / 7 | 19.1% | 18.2 s |
| RAIN_CALM | 8/8 | 7 | 1 / 7 | 17.4% | 18.2 s |

The refreshed source contained 182 eligible OSM covered features totaling 3,832 m. The
accepted conclusion remains:

```text
RAIN ENGINE VALID, COVER DATA PARTIALLY SUFFICIENT
```

General and cover-rich frequencies remain separate.

## 13. Phoenix Live 18-Route Results

| Metric | Result |
| --- | ---: |
| Searches | 18 |
| Success / failures | 18 / 0 |
| Stay Cool activation | 18 |
| Stay Cool different / same | 1 / 17 |
| Comparable routes | 18 |
| Avg extra duration where different | 27.2 s |
| Avg heat exposure reduction where different | 11.3% |
| Avg direct sun reduction where different | 40.4% |
| Full Comfort average / p95 / max | 3,184 / 6,219 / 6,940 ms |
| Fastest average / p95 / max | 85 / 130 / 177 ms |
| Managed requests/search | 6 |

This is a complete new 18-route NWS run and is not merged with the prior partial Stage 9
result.

## 14. Phoenix Controlled Heat Results

General sample:

| Scenario | Success | Different / same | Avg heat reduction | Avg direct-sun reduction | Avg extra time |
| --- | ---: | ---: | ---: | ---: | ---: |
| HEAT_EXTREME_SUN | 18/18 | 1 / 17 | 13.7% | 35.5% | 12.2 s |
| HEAT_HOT_SUN | 18/18 | 2 / 16 | 12.6% | 31.5% | 19.7 s |
| HEAT_HOT_LATE_DAY | 18/18 | 0 / 18 | 0 | 0 | 0 |
| HEAT_HOT_NIGHT | 18/18 | 0 / 18 | 0 | 0 | 0 |

All 72 routes were comparable and activated heat context.

## 15. Phoenix Shade-Rich Results

All four scenarios completed 8/8 shade-rich routes, for 32/32 total. All routes were
comparable and heat-capable. No shade-rich route reranked away from Fastest in this managed
candidate set. This is a valid same-route result, not missing data.

Night direct-sun exposure and longest sunny run were zero. Daytime longest sunny runs
varied with timestamp, confirming time-dependent solar analysis.

## 16. Phoenix Time-Of-Day Validation

Representative route `phx-07-arizona-center-to-heritage-square`:

| Period | Fastest shade | Selected shade | Fastest heat cost | Selected heat cost | Selection |
| --- | ---: | ---: | ---: | ---: | --- |
| Extreme afternoon | 0.0% | 35.5% | 39.16 | 34.66 | corridor alternative |
| Hot afternoon | 0.0% | 35.7% | 33.02 | 28.78 | corridor alternative |
| Late day | 47.1% | 47.1% | 19.69 | 19.69 | Fastest |
| Night | no direct sun | no direct sun | 11.03 | 11.03 | Fastest |

Route preference therefore changed with deterministic shade timing: the alternative won
under stronger afternoon sun, while Fastest won later and at night.

## 17. Three-Climate Environmental Matrix

Benefit units are context-specific and are not compared across rows.

| Climate | Context | Searches | Different | Same | Avg benefit where different | Avg extra time |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| Cold | Stay Warm | 54 | 0 | 54 | not applicable | 0 s |
| Rain | Stay Dry | 78 | 3 | 75 | 18.3% rain exposure reduction | 18.2 s |
| Heat | Stay Cool | 122 | 4 | 118 | 12.6% heat and 34.7% direct-sun reduction | 19.7 s |

## 18. Stage 7.5 Latency Comparison

Historical Stage 7.5 warm-cache Minneapolis baseline:

```text
average: 3,134 ms
p95: 3,572 ms
```

All 272 Stage 9.6 comparisons:

```text
average: 3,517 ms
median: 1,289 ms
p95: 17,130 ms
max: 39,584 ms
```

The average is 12% above Stage 7.5 and the p95 is materially worse. This is not managed
routing latency: Fastest averaged 63 ms and the four-attempt routing-only candidate path
averaged 85 ms at concurrency 3. The heavy tail is concentrated in long Minneapolis
building/shade/wind analysis using the direct local Overture validator path. The result is
an explicit post-Stage-9.6 environmental performance risk, not grounds to reject Mapbox.

## 19. Routing Request Accounting

Current progressive consumer search:

| Request | Count |
| --- | ---: |
| Initial progressive Fastest | 1 |
| Fastest inside Comfort comparison | 1 |
| Provider alternatives | 1 |
| Corridor waypoint attempts | 4 |
| **Total** | **7** |

The comparison response reports six requests because the first progressive request is a
separate API call. Failed requests remain counted.

## 20. Managed Provider Cost Estimate

Official Directions pricing reviewed on 2026-08-16:

| Monthly requests | Price per 1,000 |
| --- | ---: |
| First 100,000 | free |
| 100,001-500,000 | $2.00 |
| 500,001-1,000,000 | $1.60 |
| 1,000,001+ | $1.20 |
| 5,000,000+ | contact sales |

Source: https://www.mapbox.com/pricing

At seven requests/search:

| Consumer searches/month | Directions requests | Estimated tiered cost |
| ---: | ---: | ---: |
| 1,000 | 7,000 | $0 |
| 10,000 | 70,000 | $0 |
| 100,000 | 700,000 | about $1,120 |

Pricing is analysis-only and is not hard-coded in application logic.

## 21. Candidate Attempt Scenarios

Measured across 18 OD pairs at concurrency 3:

| Corridor attempts | Consumer requests/search | Candidates | Candidate latency avg | Avg unique meters | Max lateral separation avg | Cost at 100k searches |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 5 | 3 | 59 ms | 558 m | 150 m | about $800 |
| 3 | 6 | 4 | 65 ms | 677 m | 212 m | about $960 |
| 4 | 7 | 5 | 85 ms | 729 m | 247 m | about $1,120 |

Four attempts preserve the strongest measured spatial diversity for a small routing-only
latency increase. Cost alone does not justify reducing the MVP setting.

## 22. Production Data And Fixture Audit

The production fixture-boundary audit passed 3/3 checks:

- no production import from fixture/test/design-baseline paths
- no Stage 6 research routing import in production
- no Claude Design fixture literal in production runtime

Production lineage remains:

```text
real managed Mapbox walking route
+ real NWS
+ real Overture
+ real OSM covered data when configured
+ deterministic Shade / Wind / Rain / Heat / Comfort
```

Research scenarios remain explicit validation inputs only.

## 23. Files Created Or Modified

Stage 9.6 provider work created or materially updated:

- `lib/routing/providers/mapboxWalkingRoutingProvider.ts`
- `lib/routing/providers/configuredRoutingProvider.ts`
- `lib/routing/errors.ts`
- `lib/routing/requestTimeout.ts`
- `lib/routing/generators/providerAlternativeGenerator.ts`
- `lib/routing/types.ts`
- `lib/routing/service.ts`
- route API, health API, debug UI, and consumer failure handling
- `scripts/benchmark-routing-provider.ts`
- `scripts/audit-routing-provider-equivalence.ts`
- Stage 7.5, 8.5, 9, and 9.6 validation scripts
- provider, candidate, timeout, failure, usage, and production-boundary tests
- `.env.example`, production lineage, and routing runbooks
- this report and ADR-020

Validation-only script changes added provider-safe route pacing, scenario isolation, and
measured attempt-diversity output. They do not change production routing behavior.

## 24. ADR-020 Status

```text
ACCEPTED
```

See `docs/decisions/ADR-020-mvp-managed-routing-provider.md`.

## 25. Remaining Risks And Follow-Up

- Minneapolis full environmental analysis has an unacceptable heavy tail for a polished
  consumer experience even though managed routing is fast. This should be addressed as a
  separate performance task without changing Stage 9.6's provider verdict.
- Seattle route-accessible cover remains partial, so general Stay Dry frequency is low.
- Mapbox walking does not provide ComfortOS time-dependent routing; departure time remains
  an environmental-analysis input.
- No automatic vendor failover exists. A future failover design must use only approved
  normalized production providers.
- Token restrictions, rotation, quota alerts, and usage monitoring are deployment work.
- Self-hosted OSRM becomes attractive as volume cost, provider restrictions, graph control,
  or latency control outweigh managed operations. Valhalla remains a future option for
  richer multimodal or dynamic-cost routing.

These risks do not make the managed walking provider unsuitable. The stable provider gate
that blocked the three-climate MVP matrix is resolved.
