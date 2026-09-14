# ADR-031 — Authoritative Environmental Raster Layers

Date: September 13, 2026
Status: Accepted for ingestion pilots; not accepted for route scoring

## Context

ComfortOS currently computes weather, building shade, wind, rain, heat, and aggregate
comfort from normalized real inputs. Tree canopy, terrain, land cover, and surface context
remain explicit gaps. Adding them directly to the comfort formula would create false
precision: the available national products have different resolutions, dates, coverage,
uncertainty fields, and licenses.

## Decision

Use a versioned environmental source catalog as the only entry point for new static
environmental data. Every source must pin its authority, dataset version, data date,
coverage, resolution, freshness policy, license, access method, quality signals, intended
uses, and prohibited claims.

The initial primary sources are:

- USGS 3DEP Bare Earth DEM for elevation and derived terrain grade;
- USGS Annual NLCD Collection 1.2 for 2025 land cover and fractional impervious surface;
- USDA Forest Service Tree Canopy Cover 2025.6 for corridor-level canopy context; and
- Overture 2026-08-19.0 Base and Transportation data for broad landform and optional
  pedestrian-surface context.

The first terrain adapter is a bounded research pilot. It normalizes official USGS 3DEP
samples and calculates segment terrain as:

```text
grade = (endElevationMeters - startElevationMeters) / horizontalDistanceMeters
slopeDegrees = atan(abs(grade)) * 180 / pi
```

Future canopy and impervious metrics will aggregate source cells over a buffered route
corridor rather than assign one raster cell to an exact sidewalk:

```text
corridorFraction = sum(overlapArea_i * sourceFraction_i) / sum(overlapArea_i)
routeExposure = sum(segmentLength_i * corridorFraction_i) / totalRouteLength
```

Thirty-meter canopy data may support `tree canopy context`. It must not be labeled as an
individual tree, measured shade, or exact shadow. Impervious fraction may support surface
heat context but not measured surface temperature. Elevation alone cannot establish ADA
accessibility, trail safety, landslide risk, or current path condition.

Static layer artifacts will use immutable, layer-specific R2 prefixes:

```text
environment-layers/v1/<source-version>/<layer>/<jurisdiction>/<partition>/...
```

The existing building archive remains unchanged. Each new layer must upload content first,
verify byte count and SHA-256, publish its manifest last, and keep only a small checkpoint
in Git. Raw national rasters are not copied blindly: nationwide coarse products and hot
metro high-resolution products are built and activated independently.

## Activation Gates

A layer cannot affect route ranking until it has:

1. deterministic normalization and geometry tests;
2. pinned source and checksum-complete manifests;
3. explicit spatial and temporal completeness;
4. Minneapolis, Seattle, Phoenix, and mountainous-route validation;
5. latency and R2 request-cost evidence;
6. route-ordering regression tests and a model-version change; and
7. atomic deployment and rollback evidence.

## Consequences

- Better data can be collected now without silently changing the current comfort model.
- Source resolution and uncertainty remain visible in internal evidence.
- CONUS land-cover coverage is not misrepresented as full Alaska or Hawaii coverage.
- High-resolution municipal tree inventories or 1-meter lidar products can later override
  the national 30-meter prior only within explicitly validated regions.
- Route scoring will require a later ADR after calibration; this ADR authorizes ingestion
  and quality evaluation only.

## Alternatives Considered

- Using Overture land polygons alone: broad and current, but not a measured elevation or
  fractional canopy source.
- Storing every national raw raster in the active runtime: simple ownership, but excessive
  storage, cold-start, and range-read cost.
- Adding canopy and slope directly to Comfort v2: rejected because no multi-region
  calibration or production completeness contract exists yet.
