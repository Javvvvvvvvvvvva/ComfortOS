# ADR-012 — Real Overture Ingestion And Query Service

Date: 2026-08-10
Status: Accepted

## Context

Stage 5.6 ended `NOT READY FOR STAGE 6` because no real Minneapolis Overture dataset had been ingested. The blocker was the `overturemaps` CLI dependency. Stage 5.7 needs real Overture buildings through the current official cloud-hosted GeoParquet access path while preserving the `BuildingProvider` boundary.

## Decision

Use DuckDB as an offline ingestion dependency, not an application runtime dependency.

The ingestion path is:

```text
Official Overture STAC catalog
↓
latest release: 2026-07-22.0
↓
buildings / building collection
↓
HTTPS GeoParquet assets
↓
DuckDB httpfs + spatial
↓
Minneapolis bbox + ST_Intersects filter
↓
GeoJSONSeq
↓
ComfortOS local building store v1
```

The required DuckDB extensions are:

```text
httpfs
spatial
```

The `overturemaps` CLI is no longer required.

## Query Service

Use an HTTP building query service as the production-compatible runtime boundary:

```text
Cloudflare/Vinext app
↓
HttpBuildingProvider
↓
GET /buildings?bbox=west,south,east,north
↓
Building Query Service
↓
real Overture-derived spatial store
```

The response is normalized:

```ts
{
  buildings: Building[];
  metadata: {
    provider: "Overture Maps";
    datasetVersion: string;
    generatedAt: string;
    region: string;
    queryLatencyMs: number;
  };
}
```

No Overture-native schema is exposed to shade, wind, comfort, routing, or React components.

## Dataset Versioning

Stores record:

```text
provider
release
theme
type
bbox
license
sourceUrl
sourceAccessMethod
createdAt
```

New Overture releases must be ingested into a new versioned store, validated, and then activated. Production must not overwrite the active store in place.

## Geographic Expansion

ComfortOS expands by spatial partitions and tracked region configs, not by a manually written adapter per state. Minneapolis is the first validated region; Seattle, Phoenix, Chicago, or arbitrary U.S. metros should use the same STAC -> DuckDB -> partitioned store -> query-service path.

## Overpass Status

Overpass remains a development fallback, but it is no longer reliable enough for the critical building path. Stage 5.7 measured 3 failures across 18 identical route bboxes, while the local real Overture store had zero failures.

## Consequences

- Real Overture data is now available for Minneapolis validation.
- App runtime can consume Overture buildings through HTTP without Node `fs`.
- DuckDB remains an offline ingestion tool.
- The domain `BuildingProvider` abstraction remains unchanged for consumers.
- Stage 6 can proceed only after this real-data baseline is accepted; Stage 5.7 does not itself start custom routing.
