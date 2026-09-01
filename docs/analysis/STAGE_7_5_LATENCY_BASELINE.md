# Stage 7.5 Latency Baseline

Date: 2026-08-12

## Scope

This baseline measures the accepted Stage 7 MVP path before choosing a new Stage 7.5 production policy:

```text
OSRM Fastest
Stage 5 enhanced candidates
real NWS weather
real Overture Minneapolis building query service
Shade + Wind + Comfort analysis
raw-cost reranking
```

The Stage 6 research router was not used.

## Command

```text
BUILDING_PROVIDER=http-overture BUILDING_QUERY_SERVICE_URL=http://127.0.0.1:8787 npm run routes:validate:stage7.5 -- --max-candidate-attempts 4 --max-concurrent-candidate-requests 1 --output /tmp/comfortos-stage-7-5-baseline-c1.json
```

## Result

```text
success: 18 / 18
failure: 0
Limited Data: 0
Comfort != Fastest: 0
Comfort == Fastest: 18
```

| Metric | Mean | Median | P75 | P95 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fastest request | 205 ms | 139 ms | 144 ms | 564 ms | 642 ms |
| Comfort total | 4,325 ms | 4,083 ms | 5,082 ms | 7,148 ms | 9,612 ms |
| Candidate generation | 2,200 ms | 1,267 ms | 3,020 ms | 5,011 ms | 5,013 ms |
| OSRM alternatives | 781 ms | 590 ms | 995 ms | 2,022 ms | 2,042 ms |
| Corridor candidates | 2,181 ms | 1,267 ms | 3,020 ms | 5,011 ms | 5,012 ms |
| Weather fetch | 567 ms | 579 ms | 714 ms | 793 ms | 819 ms |
| Building query | 38 ms | 15 ms | 36 ms | 58 ms | 327 ms |
| Candidate analysis wall time | 970 ms | 364 ms | 1,201 ms | 2,863 ms | 4,365 ms |
| Wind analysis accumulated | 4,659 ms | 1,564 ms | 5,826 ms | 13,994 ms | 21,499 ms |
| Shade analysis accumulated | 38 ms | 38 ms | 48 ms | 75 ms | 75 ms |
| Comfort analysis accumulated | 78 ms | 87 ms | 96 ms | 146 ms | 154 ms |

## Candidate Quality

```text
generated candidates avg: 5.83
deduplicated candidates avg: 5.33
environment-analyzed candidates avg: 4.67
comparable candidates avg: 4.67
raw environmental cost range avg: 2.20
wind exposure range avg: 0.093 m/s
route overlap range avg: 0.774
```

## Interpretation

The warm-cache Stage 7 path was already below the 5 second average target in this run, but candidate generation and dense-route wind analysis remained the meaningful latency risks. Building query latency was not a bottleneck.

The accumulated Wind Engine timing was much larger than the wall-clock candidate-analysis stage because candidates were analyzed concurrently. The hotspot was repeated building projection and nearby-building scanning per segment.
