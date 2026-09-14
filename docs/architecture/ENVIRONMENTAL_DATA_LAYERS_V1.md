# Environmental Data Layers v1

Status: ingestion foundation implemented; route-scoring activation pending.

## Source Stack

| Layer | Primary source | Resolution | Coverage used | Current state |
| --- | --- | ---: | --- | --- |
| Elevation | USGS 3DEP Bare Earth DEM | 10 m nationwide default; finer where available | 50 states and D.C. | Live pilot |
| Slope / aspect | Deterministic derivation from 3DEP | Source-dependent | Same as elevation | Pilot derivation |
| Land cover | USGS Annual NLCD C1.2, 2025 | 30 m | CONUS and D.C. | Candidate |
| Impervious surface | USGS Annual NLCD C1.2, 2025 | 30 m | CONUS and D.C. | Candidate |
| Tree canopy | USDA Forest Service TCC 2025.6 | 30 m | CONUS; separate partial Alaska coverage | Candidate |
| Landforms | Overture Base 2026-08-19.0 | Vector | Global | Fallback only |
| Pedestrian surface | Overture Transportation 2026-08-19.0 | Vector, attribute-dependent | Global | Candidate |

`config/data-sources/environment-layers-v1.json` is the machine-readable source of truth.

## Storage Tiers

1. **Authoritative source:** keep the official URL, version, data date, metadata, and license.
2. **Normalized artifact:** convert only required bands/attributes into bounded spatial
   partitions with SHA-256 manifests.
3. **Runtime tile:** keep route-queryable values and cell provenance; omit unused raw bands.
4. **Hot-region refinement:** allow 1-meter lidar or municipal tree inventories only within
   separately validated metros.

The R2 object prefix is independent from the building release:

```text
environment-layers/v1/<source-version>/<layer>/<state>/<partition>/
```

## Quality Contract

Every runtime answer must retain:

- source id and pinned version;
- source data date and normalized-artifact creation date;
- source resolution and requested sampling spacing;
- analyzed distance or corridor area;
- completeness and no-data ratio;
- source uncertainty when published; and
- checksum of every immutable artifact.

Missing cells remain missing. They are never converted to zero slope, no trees, dry land,
or perfect comfort.

## Route Semantics

Terrain elevation supports grade and slope. Canopy and impervious products support
corridor-level context. Overture vectors can refine class and surface semantics where
attributes exist. None of these values enter `RouteComfortCost` until calibration changes
the model version and passes the ADR-031 activation gates.

## Build Sequence

1. Complete the Minneapolis 3DEP pilot and compare derived grades with known route profiles.
2. Repeat terrain validation in Seattle, Phoenix, Denver, and a steep Appalachian route.
3. Build one Annual NLCD/TCC tile for each climate validation region.
4. Measure raster alignment, no-data, canopy standard error, and corridor stability.
5. Define the normalized environment-cell store and R2 archive/restore commands.
6. Run route-ordering experiments without changing production recommendations.
7. Activate one layer at a time with a new comfort model version.

## Official References

- USGS 3DEP products and services:
  https://www.usgs.gov/3d-elevation-program/about-3dep-products-services
- USGS 3DEP ImageServer:
  https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer
- USGS Annual NLCD Collection 1.2:
  https://www.usgs.gov/data/annual-national-land-cover-database-nlcd-collection-1-products-ver-12-june-2026
- MRLC Annual NLCD service endpoints:
  https://www.mrlc.gov/data-services-page
- USDA Forest Service Tree Canopy Cover:
  https://data.fs.usda.gov/geodata/rastergateway/treecanopycover/
- Overture Base guide:
  https://docs.overturemaps.org/guides/base/
- Overture Transportation segment schema:
  https://docs.overturemaps.org/schema/reference/transportation/segment/
