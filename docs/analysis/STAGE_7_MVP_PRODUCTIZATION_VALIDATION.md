# Stage 7 MVP Productization Validation

Date: 2026-08-11

## Summary

Stage 7 keeps Stage 5 routing for MVP and productizes the user flow around progressive routing:

```text
Fastest route first
Comfort analysis second
```

The production app does not use the Stage 6 research router.

## Implemented State Flow

Consumer route state now separates:

- Fastest route loading / success / error
- Comfort analysis idle / loading / complete / limited / failed
- selected route candidate
- active navigation preview

When a route request starts, the app first calls `/api/routes/walking`. Once Fastest is ready, the map and route card render immediately. The app then starts `/api/routes/comfort-comparison` in the background. Stale comfort requests are aborted and still protected by request IDs.

## Product States

Validated UI states:

- Fastest ready while Comfort is still loading
- Comfort complete with Fastest also best
- Limited environmental data
- weather unavailable fallback copy
- active navigation preview without GPS-progress claims
- debug output remains behind `?debug=routing`, `?debug=shade`, `?debug=wind`, `?debug=comfort`, or `?debug=environment`

## Contextual Naming Decision

Stage 7 chooses:

```text
Fastest + Comfort
```

for balanced or mild weather, and:

```text
Fastest + Stay Warm
```

only when actual weather activates cold context.

Live validation on August 11, 2026 showed warm Minneapolis conditions in the UI (`79°F`, clear, ENE wind), so the app used balanced Comfort language and did not display `Stay Warm`.

## Real Data Provenance

Validation used:

- OSRM walking routes over OSM network
- NWS live weather
- real Overture Minneapolis building store release `2026-07-22.0`
- HTTP building query service at `http://127.0.0.1:8787`
- deterministic shade, wind, comfort, and reranking engines

No design fixture values were used in production runtime.

## Local Runtime

Real Overture store rebuilt:

```text
npm run data:buildings:minneapolis -- --output /tmp/comfortos-overture-minneapolis-store
```

Building query service:

```text
BUILDING_LOCAL_OVERTURE_STORE_DIR=/tmp/comfortos-overture-minneapolis-store BUILDING_QUERY_SERVICE_PORT=8787 npm run buildings:serve
```

App:

```text
BUILDING_PROVIDER=http-overture BUILDING_QUERY_SERVICE_URL=http://127.0.0.1:8787 npm run dev
```

## 18-Route Progressive Validation

Command:

```text
BUILDING_PROVIDER=http-overture BUILDING_QUERY_SERVICE_URL=http://127.0.0.1:8787 npm run routes:validate:stage7 -- --max-candidate-attempts 4 --output /tmp/comfortos-stage-7-progressive-routes-http-attempts4.json
```

Result:

```text
searches: 18
success: 18
failures: 0
average Fastest latency: 333 ms
p95 Fastest latency: 687 ms
average Comfort completion: 5,998 ms
p95 Comfort completion: 9,506 ms
average generated candidates: 5.83
average analyzed candidates: 4.67
average comparable candidates: 4.67
Limited Data count: 0
Comfort != Fastest: 0
Comfort == Fastest: 18
average building fetch: 18 ms
average candidate routing: 4,911 ms
average shade: 39 ms
average wind: 3,946 ms
```

Fastest remaining equal to Comfort is a valid result for the live conditions and current candidate set. The app now presents that as a useful answer instead of a broken-looking absence of a comfort route.

## Candidate Attempt Comparison

Six-attempt run:

```text
average Comfort completion: 7,564 ms
p95 Comfort completion: 11,489 ms
average generated candidates: 7.83
average comparable candidates: 4.94
Limited Data count: 0
Comfort != Fastest: 0
```

Four-attempt run:

```text
average Comfort completion: 5,998 ms
p95 Comfort completion: 9,506 ms
average generated candidates: 5.83
average comparable candidates: 4.67
Limited Data count: 0
Comfort != Fastest: 0
```

Decision: use 4 candidate attempts for the MVP product request. This is a measured latency improvement without introducing limited data in the 18-route validation.

## Screenshot Evidence

Captured local browser evidence:

- `/tmp/comfortos-stage-7-mobile-home-390x844.png`
- `/tmp/comfortos-stage-7-mobile-fastest-ready-390x844.png`
- `/tmp/comfortos-stage-7-mobile-comfort-complete-390x844.png`
- `/tmp/comfortos-stage-7-mobile-navigation-preview-390x844.png`
- `/tmp/comfortos-stage-7-375x812.png`
- `/tmp/comfortos-stage-7-430x932.png`
- `/tmp/comfortos-stage-7-1280x900.png`

Viewport checks:

- `375x812`: no horizontal overflow; bottom sheet top at 389.8 px
- `390x844`: Fastest appeared while Comfort was still loading
- `430x932`: no horizontal overflow; bottom sheet top at 447.4 px
- `1280x900`: no horizontal overflow; desktop sheet anchored to the right

## Accessibility Notes

Stage 7 keeps:

- real input semantics for search
- route options as buttons with `aria-pressed`
- polite live regions for weather, comfort, shade, wind, and navigation preview
- text explanations in addition to route color
- large touch targets for primary actions and route cards

Remaining accessibility polish should include fuller keyboard flow through map selection and a non-map coordinate entry fallback.

## Remaining MVP Blockers

- Comfort completion is improved but still above the ideal `<= 5 seconds` target on average.
- Public OSRM candidate routing remains the dominant bottleneck and has public-service reliability constraints.
- Dense-route wind analysis is still expensive.
- Active navigation is a static route preview, not live GPS turn-by-turn.
- Fastest != Comfort was not naturally observed in the live Stage 7 run; that is valid, but future validation should include naturally cold/windy production weather before tuning product claims.

## Judgment

Stage 7 is product-ready as an MVP interaction improvement. It should not trigger Stage 8 automatically.
