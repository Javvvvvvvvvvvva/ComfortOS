# Stage 5.5 Building Provider Benchmark

Date: 2026-08-10

## Scope

Stage 5.5 evaluates whether ComfortOS can move repeatable route-comfort validation away from public Overpass dependency. It does not start Stage 6 custom routing.

## Git Baseline

Initialized Git and created the required Stage 5 baseline commit:

```text
288624f chore: establish ComfortOS Stage 5 baseline
```

## Local Store

Selected prototype store:

```text
ComfortOS local building store v1
buildings.jsonl + tile-index.json + manifest.json
```

Rationale:

- no local database service required
- deterministic file output
- bbox query uses tile index rather than scanning every building
- easy to replace with DuckDB/PostGIS/D1/R2 later because the runtime boundary is still `BuildingProvider`

## Ingestion POC

Command:

```bash
npm run buildings:ingest:overture -- --input fixtures/buildings/minneapolis-overture-sample.geojson --output /tmp/comfortos-overture-sample-store --region minneapolis-sample --bounds -93.33,44.93,-93.20,45.02
```

Sample ingestion result:

```text
buildingCount: 5
explicitHeightCount: 2
floorDerivedHeightCount: 2
unknownHeightCount: 1
ingestionMs: 3
tileSizeDegrees: 0.005
```

Height coverage in this sample:

```text
explicit height: 40%
floor-derived height: 40%
unknown height: 20%
usable height: 80%
```

Important limitation: this is a checked-in Overture-like sample fixture that validates the ingestion/store/provider path. A real Minneapolis Overture extract is not present in the workspace yet, so this benchmark does not claim real citywide Overture coverage.

## Provider Strategy

Supported modes:

```text
overpass
local-overture
local-overture-with-overpass-fallback
```

The existing Overpass adapter remains intact. Local Overture is now available through `LocalOvertureBuildingProvider`, and both can be wrapped by `CachedBuildingProvider`.

Debug output now reports:

```text
building provider mode
loaded buildings
explicit heights
floor-derived heights
unknown heights
query success
building fetch latency
```

## Building Provider Benchmark

Command:

```bash
npm run buildings:benchmark -- --local-store /tmp/comfortos-overture-sample-store --output /tmp/comfortos-building-benchmark.json
```

Result across 18 Minneapolis route bbox fixtures:

```text
requestCount: 18
successCount: 18
failureCount: 0
failureRate: 0%
averageLatencyMs: 0.06
p95LatencyMs: 1
averageBuildingCount: 1.39
averageUsableHeightRatio: 60.2%
```

Public Overpass comparison from Stage 5 API smoke:

```text
providerMode: overpass
buildingFetch: 15-17 s on failed attempts
querySucceeded: false in repeated smoke attempts
result: route comparison degraded to partial non-comparable candidates
```

## Route Validation Suite

Created repeatable route fixture:

```text
fixtures/routes/minneapolis-stage-5-5-routes.json
```

The suite has 18 Minneapolis origin/destination pairs covering downtown, University, river/open, residential, bridge/open, short, medium, and longer walking trips.

## OSRM-Only vs Enhanced Validation

Direct Node validation command:

```bash
npm run routes:validate:comfort:local -- --local-store /tmp/comfortos-overture-sample-store --output /tmp/comfortos-route-validation-local-full.json
```

Result:

```text
searchCount: 36
successCount: 36
providerFailureCount: 0
partialAnalysisCount: 0
generatedCandidateAverage: 5.83
diverseCandidateAverage: 2.42
comparableCandidateAverage: 3.42
averageLoadedBuildings: 1.39
averageTotalMs: 5663
p95TotalMs: 9859
averageBuildingFetchMs: 0.06
Comfort != Fastest: 0 / 18 enhanced searches
Comfort != Fastest rate: 0%
```

Enhanced-only result:

```text
searchCount: 18
successCount: 18
providerFailureCount: 0
generatedCandidateAverage: 9.83
diverseCandidateAverage: 4.00
comparableCandidateAverage: 5.00
partialAnalysisCount: 0
averageBuildingFetchMs: 0.33
averageTotalMs: 8897
p95TotalMs: 12135
Comfort != Fastest: 0 / 18
```

No-change reason:

```text
fastest already best or insufficient improvement: 18 enhanced searches
```

## Latency Interpretation

Local building lookup is no longer the bottleneck in direct Node validation. Enhanced routing latency is dominated by OSRM waypoint route generation, typically around 9 seconds for many enhanced searches. Shade, wind, comfort, and reranking are comparatively small after local building lookup succeeds.

Prototype target status:

```text
Fastest route: near immediate to low seconds depending on OSRM
Comfort comparison: still several seconds; enhanced p95 around 10-12 s in this run
```

## Runtime Caveat

The Vinext/Cloudflare worker-like app API runtime cannot use the Node `fs` local provider directly. When `.env.local` selects `local-overture`, route debug shows `providerMode: local-overture`, but `querySucceeded: false` in the worker API path. Direct Node validation succeeds with the same store.

Recommended next production-compatible storage path:

```text
local Overture extract -> worker-compatible query service or D1/R2-backed spatial lookup
```

## Height Enrichment Decision

Recommendation for the next stage:

```text
B. Overture + OSM attribute enrichment
```

Reason: the sample proves the normalized path can preserve explicit and floor-derived heights, but it is not enough to conclude Overture alone is sufficient for Minneapolis. A real extract must measure actual height coverage before LiDAR/3DEP enrichment is considered.

## Stage 5.5 Acceptance

Completed:

- Git repository initialized
- Stage 5 baseline committed
- Overture-oriented ingestion POC exists
- local bbox-queryable building store exists
- provider remains behind `BuildingProvider`
- Overpass remains available
- provider configuration exists
- shared building reuse remains in route comparison
- route fixture suite has 18 routes
- repeatable provider and route validation harnesses exist
- provider debug visibility added
- tests/typecheck/lint pass during implementation

Partially complete:

- real Minneapolis Overture dataset was not downloaded into the workspace
- app API runtime cannot yet use Node `fs` local store because the current deployment target is worker-like

Not started:

- custom routing
- LiDAR enrichment
- production cloud infrastructure
