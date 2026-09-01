# Stage 5.7 Real Overture DuckDB Validation

Date: 2026-08-10

## Result

```text
Real Overture ingestion: PASS
Overture CLI dependency removed: PASS
HTTP query service: PASS
18-route real-data validation: PASS
Ready for Stage 6: READY, after human acceptance of this Stage 5.7 report
```

Stage 5.7 does not begin Stage 6.

## Official Source

Official Overture source resolved from STAC:

```text
STAC root: https://stac.overturemaps.org/catalog.json
latest release: 2026-07-22.0
theme: buildings
type: building
collection: https://stac.overturemaps.org/2026-07-22.0/buildings/building/collection.json
license: ODbL-1.0
```

Minneapolis intersects two official GeoParquet assets:

```text
00046
00047
```

The source URL pattern is:

```text
s3://overturemaps-us-west-2/release/2026-07-22.0/theme=buildings/type=building/*
```

DuckDB extensions:

```text
httpfs
spatial
```

## Region

Tracked region config:

```text
config/data-regions/minneapolis.json
```

Bbox:

```text
west:  -93.33
south:  44.93
east:  -93.20
north:  45.02
```

## Ingestion

Command:

```bash
npm run data:buildings:minneapolis -- --output /tmp/comfortos-overture-minneapolis-store
```

Pipeline:

```text
STAC latest release
↓
intersecting building item assets
↓
DuckDB read_parquet over HTTPS
↓
bbox + ST_Intersects filter
↓
GeoJSONSeq
↓
ComfortOS local building store v1
```

Extraction stats:

```text
building count: 97,618
explicit height: 66,487 (68.11%)
floor-derived height: 1,453 (1.49%)
unknown height: 29,678 (30.40%)
DuckDB rows with num_floors: 4,831
building has_parts count: 155
invalid geometry count: 0
source datasets: Esri Community Maps, Microsoft ML Buildings, OpenStreetMap
extraction time: 56.839 s
ingestion/store build time: 838 ms
```

Store format:

```text
buildings.jsonl
tile-index.json
manifest.json
```

Store size:

```text
48 MB
buildings.jsonl: 47 MB
tile-index.json: 600 KB
manifest.json: 792 B
```

The store remains outside Git under `/tmp`.

## Local Query Performance

Command:

```bash
npm run buildings:benchmark -- --local-store /tmp/comfortos-overture-minneapolis-store --output /tmp/comfortos-stage-5-7-building-benchmark.json
```

Result across 18 route bboxes:

```text
success: 18 / 18
failure rate: 0%
average latency: 17 ms
p95 latency: 297 ms
average building count: 2,086.56
average usable height ratio: 66.00%
```

The p95 includes first cold-load cost. Warm tile-index queries were typically 0-8 ms.

## Overpass Comparison

Command:

```bash
npm run buildings:benchmark -- --local-store /tmp/comfortos-overture-minneapolis-store --include-overpass true --output /tmp/comfortos-stage-5-7-building-overpass-comparison.json
```

Summary:

| Provider | Success | Failure Rate | Avg Latency | p95 Latency | Avg Building Count | Avg Usable Height |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Real Overture local | 18/18 | 0% | 18.17 ms | 286 ms | 2,086.56 | 66.00% |
| Overpass | 15/18 | 16.67% | 9,580.87 ms | 26,411 ms | 1,691.93 | 39.09% |

Overpass failures occurred on:

```text
downtown-university
powderhorn-whittier
dinkytown-downtown
```

## HTTP Query Service

Implemented:

```bash
npm run buildings:serve
```

Endpoints:

```http
GET /buildings?bbox=west,south,east,north
GET /metadata
```

Smoke result:

```text
provider: Overture Maps
datasetVersion: 2026-07-22.0
region: minneapolis-validation
queryLatencyMs: 0 for the smoke bbox after store load
```

The service returns normalized `Building[]` and metadata. It does not expose raw Overture schema.

Recommended runtime mode:

```text
BUILDING_PROVIDER=http-overture
BUILDING_QUERY_SERVICE_URL=http://127.0.0.1:8787
```

## 18-Route Enhanced Validation

Command:

```bash
npm run routes:validate:comfort:local -- --local-store /tmp/comfortos-overture-minneapolis-store --modes enhanced --output /tmp/comfortos-stage-5-7-route-validation-enhanced.json
```

Summary:

```text
searches: 18
success: 18
provider failures: 0
generated candidates avg: 9.83
diverse candidates avg: 4.00
environment-analyzed candidates: 5 per route
comparable candidates avg: 5.00
partial analyses: 0
average loaded buildings: 1,431.78
average total latency: 8,901 ms
p95 total latency: 13,007 ms
average building fetch: 18.72 ms
Comfort != Fastest: 0 / 18
Comfort == Fastest: 18 / 18
```

No Comfort route was forced. The no-change reason for all 18 enhanced searches was:

```text
fastest already best or insufficient improvement
```

Latency remains dominated by OSRM candidate routing and, on dense residential routes, wind analysis over many buildings. Building lookup is no longer the critical failure point.

## Hybrid Enrichment

Not implemented in Stage 5.7.

Reason: real Overture usable-height coverage is 69.60% after floor-derived heights, and explicit height coverage alone is 68.11%. That is strong enough to validate Stage 5.7 without merging OSM attributes. A future enrichment experiment can still compare spatial/entity matching, but it should preserve per-attribute provenance.

## Fixture Audit Revalidation

Stage 5.6 production fixture tests still pass:

```text
production runtime code does not import fixture/test/design-baseline paths
production runtime code does not contain Claude Design fixture literals
```

The real Overture command does not reference the five-building fixture and fails on real extraction errors with:

```text
No fixture fallback was used.
```

## Final Judgment

```text
READY FOR STAGE 6
```

This means the Stage 5 real building-data blocker is closed. Stage 6 must still be started explicitly in a separate stage.
