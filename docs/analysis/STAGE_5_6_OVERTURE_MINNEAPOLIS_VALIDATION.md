# Stage 5.6 Overture Minneapolis Validation

Date: 2026-08-10

## Scope

Build a real Overture Maps Buildings pipeline for the Minneapolis validation region without using the Stage 5.5 five-building fixture as a substitute.

## Official Source Check

Official Overture documentation reviewed:

```text
https://docs.overturemaps.org/getting-data/
https://docs.overturemaps.org/getting-data/overturemaps-py/
https://docs.overturemaps.org/release-calendar/
https://docs.overturemaps.org/guides/attribution/
```

Current target for this pipeline:

```text
provider: Overture Maps
release: 2026-07-22.0
theme: buildings
type: building
download method: official Overture Maps Python CLI
format: geojsonseq -> ComfortOS local building store v1
source URL pattern: s3://overturemaps-us-west-2/release/2026-07-22.0/theme=buildings/type=building/*
license/attribution: follow Overture attribution guidance and per-feature sources[] metadata
```

## Minneapolis Validation Region

Bounding box:

```text
west:  -93.33
south:  44.93
east:  -93.20
north:  45.02
```

Serialized command bbox:

```text
-93.33,44.93,-93.20,45.02
```

This covers the current validation suite’s downtown Minneapolis, University of Minnesota area, Mississippi river corridors, bridge/open routes, and nearby residential route samples without downloading a statewide or national extract.

## Reproducible Command

Implemented:

```bash
npm run data:buildings:minneapolis
```

Default output:

```text
/tmp/comfortos-overture-minneapolis-store
```

Pipeline:

```text
official overturemaps CLI
↓
overturemaps download --bbox -93.33,44.93,-93.20,45.02 -f geojsonseq --type building
↓
scripts/ingest-overture-buildings.ts
↓
schema/geometry validation
↓
normalized Building records
↓
buildings.jsonl + tile-index.json + manifest.json
```

The generated manifest now supports:

```json
{
  "provider": "Overture Maps",
  "release": "2026-07-22.0",
  "theme": "buildings",
  "type": "building",
  "bbox": [-93.33, 44.93, -93.2, 45.02],
  "license": "See Overture attribution page and per-feature sources[] metadata",
  "sourceUrl": "s3://overturemaps-us-west-2/release/2026-07-22.0/theme=buildings/type=building/*",
  "sourceAccessMethod": "Official Overture Maps Python CLI: overturemaps download --bbox ... -f geojsonseq --type=building"
}
```

## Execution Result In This Environment

Command run:

```bash
npm run data:buildings:minneapolis -- --output /tmp/comfortos-overture-minneapolis-store
```

Result:

```text
Official Overture CLI is not installed.
Install with `python3 -m pip install overturemaps` or run with `uvx overturemaps ...`.
No fixture fallback was used.
```

No real Minneapolis Overture store was generated in this environment.

## Overture Schema Normalization

The ingestion boundary maps provider fields into the existing internal `Building` model:

```text
Overture feature geometry
↓
Polygon / MultiPolygon footprint

height / height_m / height_meters
↓
heightMeters with heightSource=provider

min_height / min_height_m / min_height_meters
↓
minHeightMeters

num_floors / floors / levels
↓
floors and floor-derived height when explicit height is absent
```

The shade and wind engines still consume only normalized `Building[]`; they do not understand Overture-native fields.

## Real Height Mapping Status

The mapping is defensible for known height-like fields, but real Minneapolis height coverage has not been measured because the real dataset was not downloaded. No precision is inferred from absent fields. Unknown heights remain `heightSource="unknown"` and reduce analysis quality rather than creating fake shadows or strong wind shelter.

## Overpass Comparison Status

Not completed in this environment.

Reason:

```text
No real Overture Minneapolis store exists yet, so an Overture vs Overpass comparison would be invalid.
```

The Stage 5.6 comparison remains blocked until the official Overture CLI is installed and `npm run data:buildings:minneapolis` produces a real store.

## Hybrid Enrichment Assessment

Recommendation remains:

```text
Overture footprint geometry + OSM height/levels enrichment
```

But enrichment must wait until real Overture building count and height coverage are measured. Any future enrichment must preserve per-attribute provenance and must not merge OSM values automatically without spatial/entity match confidence.

## Stage 5.6 Validation Judgment

```text
REAL OVERTURE PIPELINE: IMPLEMENTED
REAL MINNEAPOLIS OVERTURE DATASET: BLOCKED
FIXTURE FALLBACK USED: NO
READY FOR STAGE 6: NOT READY
```
