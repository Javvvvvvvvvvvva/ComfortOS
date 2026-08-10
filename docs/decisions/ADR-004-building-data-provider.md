# ADR-004: Stage 2 Building Data Provider

Date: 2026-08-08
Status: Accepted

## Context

Stage 2 needs real building footprints and honest height provenance for deterministic building-shade analysis. The domain model must not depend on a provider schema, and missing height data must remain visible because shade estimates depend on vertical geometry.

## Decision

ComfortOS will use OpenStreetMap building data through the Overpass API as the Stage 2 live development provider. The provider is isolated behind `BuildingProvider` and normalizes buildings into:

```text
Building
BoundingBox
heightSource
confidence
```

Overture Maps Buildings is the preferred production-scale source once ComfortOS has an ingestion/query pipeline. Overture has a purpose-built buildings schema with footprint geometry plus optional `height`, `num_floors`, `min_height`, and building parts, and it is distributed openly through cloud object storage. For Stage 2, however, direct bbox querying from the app/server is simpler with Overpass and is enough to validate the engine boundary in Minneapolis.

## Height Policy

Height precedence:

```text
explicit provider height
number of floors x configured floor height
unknown
```

Floor-derived height uses `3 m` per floor and is marked `heightSource = "floors-derived"` with lower confidence. Missing height remains `heightSource = "unknown"` and does not generate a shadow. Unknown-height buildings reduce coverage/confidence rather than being silently treated as short or absent.

## Consequences

- UI and shadow logic consume normalized `Building` objects, not Overpass JSON.
- Stage 2 can load real Minneapolis buildings without precomputing a city.
- Building cache keys are bbox-based because buildings are relatively static.
- Production should replace direct Overpass calls with an Overture-backed tile or warehouse service behind the same provider interface.
- OSM/Overpass availability and query limits are development constraints, not ComfortOS architecture.

## Alternatives Considered

- Overture Maps direct access: strong schema, open data, and production scalability, but app-time bbox querying requires DuckDB/cloud parquet or a dedicated ingestion service.
- Commercial building/3D providers: stronger height coverage in some markets, but introduce cost and lock-in before Stage 2 needs them.
