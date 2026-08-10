# ADR-010: Stage 5.5 Building Ingestion and Provider Strategy

Status: Accepted

Date: 2026-08-10

## Context

Stage 5 candidate generation produced useful route diversity, but validation was blocked by public Overpass building availability and latency. ComfortOS needs repeatable building data access before custom routing begins.

## Decision

ComfortOS keeps the existing Overpass `BuildingProvider` as a development fallback and adds a local Overture-oriented ingestion proof of concept behind the same normalized `BuildingProvider` interface.

The Stage 5.5 local store format is:

```text
Overture Buildings extract
  -> normalized Building records
  -> buildings.jsonl
  -> tile-index.json
  -> manifest.json
  -> LocalOvertureBuildingProvider.getBuildings(bounds)
```

The selected prototype spatial store is a local JSONL building store plus fixed-degree tile index. This is not the final production store, but it has very low operational complexity, is reproducible in CI/local development, and supports bbox queries without scanning every building.

## Provider Strategy

Runtime provider configuration supports:

```text
BUILDING_PROVIDER=overpass
BUILDING_PROVIDER=local-overture
BUILDING_PROVIDER=local-overture-with-overpass-fallback
BUILDING_LOCAL_OVERTURE_STORE_DIR=/absolute/path/to/store
```

App-facing environment engines still receive only normalized `Building[]` records. Overture schema details remain in ingestion/provider code.

## Cache Strategy

`CachedBuildingProvider` wraps provider implementations with bounded TTL/LRU behavior. It records hit/miss counts, does not cache failed provider requests, and prevents unbounded cache growth.

## Runtime Limitation

The current Vinext/Cloudflare worker-like dev API runtime cannot use the Node `fs` local provider directly. Direct Node validation uses `LocalOvertureBuildingProvider` successfully. For the browser API runtime, a production local provider should expose the indexed store through a service, D1/R2-backed lookup, or another worker-compatible storage path.

## Consequences

Stage 5.5 reduces validation dependence on public Overpass for Node-side engine validation. It also exposes building provider mode and height coverage in route-comparison debug output.

This does not implement custom routing, edge-level environmental graph costs, LiDAR enrichment, or a production nationwide Overture pipeline.
