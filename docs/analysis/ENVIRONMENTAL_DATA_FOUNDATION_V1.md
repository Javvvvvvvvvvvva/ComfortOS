# Environmental Data Foundation v1 Validation

Date: September 13, 2026
Status: SOURCE CONTRACT ACCEPTED; ROUTE-SCORING ACTIVATION PENDING

## Scope

This checkpoint adds a versioned source and quality contract for terrain, land cover,
impervious surface, tree canopy, landforms, and pedestrian surface. It does not change the
Comfort v2 formula or production route ranking.

## Accepted Sources

| Layer | Authority and pinned source | Role |
| --- | --- | --- |
| Elevation | USGS 3DEP service data through 2026-08-24 | Live research pilot |
| Land cover | USGS Annual NLCD Collection 1.2, 2025 | Ingestion candidate |
| Impervious surface | USGS Annual NLCD Collection 1.2, 2025 | Ingestion candidate |
| Tree canopy | USDA Forest Service TCC 2025.6 | Ingestion candidate |
| Landforms | Overture Base 2026-08-19.0 | Coverage fallback only |
| Pedestrian surface | Overture Transportation 2026-08-19.0 | Ingestion candidate |

The machine-readable catalog audit accepted all six entries and confirmed pinned versions,
HTTPS access/license references, distinct activation states, quality signals, intended uses,
and prohibited claims. Live access checks use the actual MRLC WMS capability endpoints for
Annual NLCD instead of USGS editorial pages that reject automated requests.

On September 13, 2026, live access checks returned HTTP 200 for all six catalog entries.
The audit exits nonzero if a future live check fails, so source outages or moved endpoints
cannot silently pass automation.

## Live 3DEP Evidence

The Minneapolis validation region was sampled as a centered 7 by 7 grid with 50-meter
spacing. The official USGS 3DEP ImageServer returned all 49 requested points.

| Check | Result |
| --- | ---: |
| Complete sample ratio | 1.0 |
| Reported source resolution | 1 m |
| Minimum elevation | 255.026489258 m |
| Maximum elevation | 260.723876953 m |
| Elevation range | 5.697387695 m |
| Maximum derived slope | 3.109952287 degrees |
| Mean derived slope | 0.545721480 degrees |
| Maximum absolute grade | 0.054332275 |
| Samples SHA-256 | `b9c9e523e5ea5b10f2b9d05660ffd7e7300334701d0dfc588aae9a070e73b6ab` |

The checksum recorded in `manifest.json` matched an independent SHA-256 calculation over
`terrain-samples.jsonl`. The 1-meter response is evidence for this pilot location, not a
nationwide resolution guarantee.

## Claim Boundaries

- Thirty-meter TCC can describe buffered route-corridor canopy context, not individual
  trees, exact shadows, or rain cover.
- NLCD impervious fraction is not measured surface temperature.
- Elevation-derived grade is not an ADA-accessibility, trail-safety, landslide, or current
  path-condition assessment.
- Missing data remains missing and reduces completeness.
- No source in this checkpoint changes a consumer recommendation or public comfort score.

## Next Build Sequence

1. Repeat terrain pilots in Seattle, Phoenix, and steep mountainous validation regions.
2. Build aligned NLCD and TCC tiles for the three climate validation metros.
3. Measure no-data, canopy standard error, raster alignment, and buffered-corridor stability.
4. Define the normalized environment-cell contract and layer-specific R2 archive pipeline.
5. Run shadow route-ordering experiments before proposing a new comfort model version.

Judgment: READY FOR MULTI-REGION ENVIRONMENTAL INGESTION PILOTS
