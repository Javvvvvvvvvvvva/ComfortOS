# ADR-011 — Production Building Data Runtime Boundary

Date: 2026-08-10
Status: Accepted

## Context

Stage 5.5 proved a local Overture-oriented building store behind `BuildingProvider`, but the Vinext / Cloudflare-worker-like app runtime cannot use the Node `fs` local provider directly. Stage 5.6 also requires that fixture building data never be used silently when real Overture data is unavailable.

## Options Evaluated

Option A: dedicated building-query service.

```text
App Worker
↓ HTTP
Building Query Service
↓
Overture-derived spatial store
```

This keeps the app worker small, preserves `BuildingProvider`, allows DuckDB/PostGIS/local files behind a service, supports versioned datasets, and can be replaced later without touching shade, wind, or comfort engines.

Option B: Cloudflare-compatible storage/index.

R2 plus partitioned metadata, D1 spatial lookup, or similar worker-native storage could reduce infrastructure pieces. The risk is spatial-query complexity, large dataset update/version handling, and premature coupling to a storage layout before real Overture Minneapolis measurements are available.

Option C: external spatial database/service.

PostGIS or a managed spatial service is the strongest query model and scales well, but adds operational cost and deployment complexity before the prototype has measured real Overture coverage, height completeness, and route-level latency.

## Decision

Use Option A as the next prototype runtime boundary: a dedicated building-query service returning normalized `Building[]` over HTTP.

Stage 5.6 adds `HttpBuildingProvider` and `BUILDING_PROVIDER=building-query-service` with `BUILDING_QUERY_SERVICE_URL`. Consumers remain unchanged:

```text
ShadeEngine / WindEngine / ComfortEngine
↓
BuildingProvider
↓
normalized Building[]
```

The existing Node `LocalOvertureBuildingProvider` remains valid for ingestion verification, local service internals, and direct Node validation, but it is not the app-worker production path.

## Consequences

- Worker runtime no longer needs direct Node `fs` access for production building lookup.
- Overture, Overpass enrichment, DuckDB, PostGIS, or partitioned object stores can be hidden behind the query service.
- Dataset provenance and version can be surfaced by the service without changing environmental engines.
- `BUILDING_PROVIDER=local-overture` fails explicitly when the local store is missing.
- Fixture stores are prohibited in production configuration.

## Deferred

Stage 5.6 does not deploy the query service, choose its backing database, or start Stage 6 custom routing. The real Minneapolis Overture dataset must be ingested before production-scale store and service benchmarks are meaningful.
