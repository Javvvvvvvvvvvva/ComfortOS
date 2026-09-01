# Building Data Geographic Expansion

Date: 2026-08-10

## Principle

ComfortOS should expand by spatial partition, not by hand-written city/state adapters.

The application and environmental engines continue to depend only on:

```text
BuildingProvider.getBuildings(bounds)
```

Storage may change underneath that interface.

## Stage 5.7 Shape

```text
Official Overture STAC release catalog
↓
theme=buildings/type=building GeoParquet assets
↓
DuckDB httpfs + spatial
↓
region bbox filter
↓
ComfortOS local building store v1
↓
HTTP Building Query Service
↓
HttpBuildingProvider
```

The Minneapolis store uses:

```text
buildings.jsonl
tile-index.json
manifest.json
```

The index already uses spatial tile semantics, so adding a new region means adding new partitions/tiles, not changing shade, wind, comfort, or UI code.

## Stage 9 Phoenix Region

Stage 9 adds Phoenix as another spatial partition:

```text
config/data-regions/phoenix.json
↓
DuckDB extraction from official Overture GeoParquet
↓
/tmp/comfortos-overture-phoenix-store
↓
MultiRegionOvertureBuildingProvider
↓
HttpBuildingProvider
```

Phoenix is not implemented as a provider special case. The same `BuildingProvider.getBuildings(bounds)` consumer boundary serves Minneapolis, Seattle, and Phoenix by bbox/manifest partition routing.

Stage 9 ingestion used Overture release `2026-06-17.0` for Phoenix because the documented STAC root was unavailable during the run; the extractor first attempted STAC, then used DuckDB parquet metadata over the official public release glob to select intersecting assets. No fixture fallback was used.

Phoenix validation store:

```text
bbox: [-112.115, 33.425, -112.045, 33.535]
buildingCount: 51,737
explicitHeightCount: 50,401
floorDerivedHeightCount: 63
unknownHeightCount: 1,273
storeSize: 26 MB
extractionSeconds: 66.641
ingestionMs: 400
```

Multi-region HTTP provider smoke validation:

| Region | Store | Query count | Explicit | Floor-derived | Unknown | Dataset version |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Minneapolis | `/tmp/comfortos-overture-minneapolis-store` | 284 | 80 | 67 | 137 | 2026-06-17.0 |
| Seattle | `/tmp/comfortos-overture-seattle-store` | 460 | 394 | 13 | 53 | 2026-07-22.0 |
| Phoenix | `/tmp/comfortos-overture-phoenix-store` | 758 | 701 | 1 | 56 | 2026-06-17.0 |

## Expansion Path

### One Metro

Run the DuckDB ingestion command for a tracked region config:

```text
config/data-regions/<region>.json
```

The output is versioned by Overture release and region.

### Multiple U.S. Metros

Store independent region extracts under a shared release namespace:

```text
stores/
  2026-07-22.0/
    minneapolis-validation/
    seattle-core/
    phoenix-core/
    chicago-core/
```

The query service routes bbox requests to intersecting region/tile indexes.

### Nationwide

Move from metro extracts to demand-driven Overture spatial partitions:

```text
Overture STAC item bbox
↓
ComfortOS tile partition
↓
query-service partition registry
```

This avoids a manually curated file per state. State boundaries are administrative, but ComfortOS queries are spatial.

## On-Demand Region Ingestion Concept

Future workflow:

```text
user requests unsupported bbox
↓
app receives explicit unsupported-region response
↓
background ingestion job resolves required Overture STAC items
↓
new versioned partitions are generated and validated
↓
query service switches the region from unavailable to available
```

The user request path should not block while ingestion runs. Unsupported areas should fail honestly until data exists.

## Dataset Update Strategy

```text
new Overture release
↓
ingest into new versioned store
↓
run bbox/provider/route validation
↓
publish new query-service dataset version
↓
switch active version
↓
retain previous version for rollback
```

Never overwrite the active production store in place.
