# Stage 6 Edge-Level Routing Research

Date: 2026-08-10

## Question

Should ComfortOS move from Stage 5 OSRM-backed candidate generation and route-level reranking to a ComfortOS-owned edge-level environmental pedestrian router for MVP?

## Scope

Stage 6 is a research proof of concept only. It does not replace OSRM in the production app and does not introduce product modes such as Stay Warm, Stay Dry, Climate DNA, or Valhalla-backed production routing.

The implementation lives under `lib/routing-research/` and the validation runner is `scripts/run-stage-6-routing-research.ts`.

## Method

The research graph is built from normalized OSRM walking route geometry:

- OSRM fastest route
- Stage 5 enhanced candidates
- bidirectional edges between route geometry vertices
- deterministic nearest-node origin and destination selection

Each edge is scored through the existing engines:

- `ShadeAnalysisService`
- `WindAnalysisService`
- `ComfortAnalysisService`

Missing edge environmental data is not treated as ideal. Failed edge scoring receives a conservative high environmental cost, confidence `0`, and `comparable: false`.

Controlled Minneapolis winter scenarios are fixed research inputs, not production weather:

- `WINTER_NW_STRONG`
- `WINTER_WEST_MODERATE`
- `WINTER_CALM`

## Validation

Command:

```text
npm run research:routing:stage6 -- --local-store /tmp/comfortos-overture-minneapolis-store --output /tmp/comfortos-stage-6-routing-research.json
```

Dataset:

- Real Overture Minneapolis building store from Stage 5.7
- 18 Minneapolis validation routes
- 3 controlled winter scenarios
- 54 scenario searches
- 0 unrecovered route errors

The runner had intermittent OSRM `fetch failed` errors during the full run. Per-route retries recovered all failures, but the fragility reinforces that this is a research harness, not production routing infrastructure.

## Results

| Scenario | Searches | Stage 5 comfort differs | Stage 6 comfort differs | Avg extra duration | Avg environmental reduction | Avg wind reduction | Avg runtime |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `WINTER_NW_STRONG` | 18 | 0 | 4 | 0.71 s | 0.23% | 0.040 m/s | 36.8 s |
| `WINTER_WEST_MODERATE` | 18 | 0 | 3 | 0.40 s | 0.21% | 0.023 m/s | 36.5 s |
| `WINTER_CALM` | 18 | 0 | 5 | 0.76 s | 0.21% | 0.005 m/s | 36.5 s |

Across all scenarios:

- Stage 6 selected a different path in 12 of 54 searches.
- Those differences occurred on 6 of 18 unique routes.
- Maximum environmental reduction was 2.19%.
- Maximum wind exposure reduction was 0.378 m/s.
- Average scenario runtime was 36.6 seconds.
- Worst scenario runtime was 144.8 seconds.
- Average edge-environment cache hit rate was about 86.5%.

## Interpretation

Stage 6 proves the architecture can perform edge-level environmental search using ComfortOS engines. It also proves that edge search can find graph paths that Stage 5 route-level reranking cannot select.

The product signal is not yet strong enough to move MVP routing onto this engine:

- The average environmental improvement is very small.
- Runtime is far outside an interactive route-planning budget.
- The graph is still derived from OSRM candidates, not a complete pedestrian network.
- Network fragility remains because OSRM still supplies the candidate geometry.
- The lambda objective needs calibration before it can support a user promise.

The main value of Stage 6 is evidence that edge-level costs are a viable research direction, not evidence that ComfortOS should own production graph routing immediately.

## Recommendation

`KEEP STAGE 5 FOR MVP`

Stage 5 should remain the MVP routing path. It is simpler, already aligned with the provider boundary, and avoids premature ownership of pedestrian graph search.

The second-order recommendation is to evaluate Valhalla before building a production ComfortOS router. If future product requirements demand edge-level objectives, ComfortOS should compare:

- Stage 5 enhanced OSRM candidates
- Valhalla candidate generation and costing hooks
- a ComfortOS-owned graph router with cached edge environmental costs

## Stage 6 Gate

Stage 6 is accepted as research evidence, but it is not ready to become product routing.

Do not begin production custom routing until ComfortOS has:

- a complete local pedestrian graph source
- cached edge environmental costs
- sub-second or low-single-digit-second route search targets
- calibrated objective weights
- validation showing materially larger comfort improvements than Stage 5
