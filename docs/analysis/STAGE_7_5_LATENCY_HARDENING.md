# Stage 7.5 Latency Hardening

Date: 2026-08-12

## Result

```text
MVP LATENCY ACCEPTABLE
```

Stage 7.5 reduced warm-cache Comfort completion while preserving route validity, real-data correctness, candidate diversity, comparability semantics, and Fastest independence.

## Final Configuration

```text
maxCandidateAttempts: 4
maxConcurrentCandidateRequests: 3
maxEnvironmentAnalyzedCandidates: 5
Comfort timeout: 12 seconds
```

## Baseline

Baseline command:

```text
BUILDING_PROVIDER=http-overture BUILDING_QUERY_SERVICE_URL=http://127.0.0.1:8787 npm run routes:validate:stage7.5 -- --max-candidate-attempts 4 --max-concurrent-candidate-requests 1 --output /tmp/comfortos-stage-7-5-baseline-c1.json
```

Baseline summary:

```text
success: 18 / 18
failure: 0
Limited Data: 0
Comfort average: 4,325 ms
Comfort p95: 7,148 ms
Comfort max: 9,612 ms
candidate generation average: 2,200 ms
candidate generation p95: 5,011 ms
candidate analysis average: 970 ms
Wind accumulated average: 4,659 ms
Wind accumulated p95: 13,994 ms
```

## Candidate Concurrency

| Policy | Success | Comfort Mean | Comfort P95 | Generated Avg | Comparable Avg | Raw Cost Range Avg | Wind Range Avg |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| attempts 4, concurrency 1 | 18/18 | 4,325 ms | 7,148 ms | 5.83 | 4.67 | 2.20 | 0.093 m/s |
| attempts 4, concurrency 2 | 18/18 | 5,500 ms | 8,353 ms | 5.83 | 4.67 | 2.20 | 0.093 m/s |
| attempts 4, concurrency 3 | 18/18 | 3,583 ms | 6,392 ms | 5.83 | 4.67 | 2.20 | 0.093 m/s |

Decision: use concurrency 3 as a bounded MVP setting. Concurrency 2 was worse in this live public-provider run, which shows provider jitter is real. Concurrency remains bounded and should be revisited before production deployment against either public OSRM quotas or a self-hosted routing service.

## Candidate Attempt Policy

| Policy | Success | Comfort Mean | Comfort P95 | Generated Avg | Comparable Avg | Raw Cost Range Avg | Wind Range Avg |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| attempts 2, concurrency 3 | 18/18 | 3,465 ms | 6,012 ms | 3.83 | 3.50 | 1.60 | 0.068 m/s |
| attempts 3, concurrency 3 | 18/18 | 4,753 ms | 7,398 ms | 4.83 | 4.22 | 2.06 | 0.083 m/s |
| attempts 4, concurrency 3 | 18/18 | 3,583 ms | 6,392 ms | 5.83 | 4.67 | 2.20 | 0.093 m/s |

Decision: keep 4 attempts. Two attempts were faster but reduced candidate coverage and environmental spread. Three attempts had worse live latency than four attempts and still reduced coverage. Adaptive and early-stop helpers were added and tested, but are not enabled for the MVP default because the 18-route evidence did not justify them.

## Wind Optimization

Change:

```text
Building[]
↓
prepared projected building context
↓
lightweight in-memory spatial grid
↓
per-segment nearby building lookup
```

The Wind Engine previously projected and scanned the same building set repeatedly for every segment. Stage 7.5 prepares the projected shapes once per route analysis and queries nearby buildings from a request-local grid.

Measured result with final policy:

```text
success: 18 / 18
failure: 0
Limited Data: 0
Comfort average: 3,134 ms
Comfort p95: 3,572 ms
Comfort max: 6,326 ms
candidate generation average: 2,019 ms
candidate generation p95: 2,094 ms
candidate analysis average: 95 ms
candidate analysis p95: 195 ms
Wind accumulated average: 307 ms
Wind accumulated p95: 642 ms
```

Candidate quality remained equivalent:

```text
generated candidates avg: 5.83
analyzed candidates avg: 4.67
comparable candidates avg: 4.67
Limited Data: 0
Comfort != Fastest: 0
Comfort == Fastest: 18
raw environmental cost range avg: 2.20
wind exposure range avg: 0.093 m/s
```

The small raw and wind range differences between runs are attributable to live weather/provider timing and the prepared spatial lookup, not changed Comfort weights or selection semantics. Comfort still selected the same category result: Fastest remained the Comfort route in all 18 searches.

## Other Changes

- Added debug-only high-resolution timing fields for Fastest, OSRM alternatives, corridor candidates, candidate normalization, dedupe, filtering, weather, building query, shade, wind, comfort, reranking, serialization, and total.
- Added request-scoped candidate route cache keyed by origin, destination, waypoint, and walking profile.
- Added cancellation propagation through `compareWalkingRoutes`, routing provider fetches, and HTTP building fetches.
- Added a 12 second Comfort timeout in the UI. Fastest remains usable if background analysis exceeds this cap.
- Added a debug-only route timing row behind `?debug=routing`.

## Browser Regression

Viewport checks:

```text
375x812: no horizontal overflow; no text overflow
390x844: no horizontal overflow; no text overflow
430x932: no horizontal overflow; no text overflow
1280x900: no horizontal overflow; no text overflow
```

Screenshot artifacts:

```text
/tmp/comfortos-stage-7-5-375x812.png
/tmp/comfortos-stage-7-5-390x844.png
/tmp/comfortos-stage-7-5-430x932.png
/tmp/comfortos-stage-7-5-1280x900.png
/tmp/comfortos-stage-7-5-mobile-fastest-390x844.png
/tmp/comfortos-stage-7-5-mobile-complete-390x844.png
```

The 390x844 route-flow check confirmed:

- Fastest renders before Comfort completes
- Comfort analysis enters a non-spinning terminal state
- debug timing row appears behind `?debug=routing`
- no timeout copy appeared during the successful run

Note: the browser dev server loaded `.env.local`, which currently points to the local sample Overture store. The browser route-flow check is therefore a UI/interaction regression check. The real-data latency and completeness claims come from the Node benchmark using `BUILDING_PROVIDER=http-overture` and the real Minneapolis Overture query service.

## Verification

```text
npm run typecheck: pass
npm test: pass, 122 tests
npm run lint: pass
npm run build: pass
```

Build emitted the existing Vinext/Vite large chunk and route-classification warnings.

## Remaining Bottleneck

After prepared wind context, local environmental analysis is no longer the primary bottleneck. Candidate generation through public OSRM is the remaining tail risk. One final run still had a 6.33 second max due to candidate routing.

## Recommendation

Do not begin Stage 8 automatically. The next performance-oriented stage should evaluate routing-provider operations, especially self-hosted OSRM versus a managed routing provider, before changing Comfort semantics or reviving the Stage 6 research router for production.
