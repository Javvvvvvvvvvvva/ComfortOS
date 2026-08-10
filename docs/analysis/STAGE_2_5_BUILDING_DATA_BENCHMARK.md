# Stage 2.5 Building Data Benchmark

Date: 2026-08-09

## Purpose

Stage 2.5 checked whether ComfortOS should keep using OpenStreetMap through Overpass for development shade validation, move to Overture Maps Buildings immediately, use a hybrid approach, or require height enrichment before production-quality building shade.

This benchmark is limited to the same Minneapolis validation corridor used for Stage 2 shade testing:

```text
[-93.2353, 44.9739] -> [-93.2317, 44.9739] -> [-93.2288, 44.9753]
```

The route fixture distance was 430 m and duration was 360 seconds.

## Stage 2.5 Engine Measurement

The production route-shade calculation now uses exact LineString intersection against the unioned shaded intervals of generated shadow polygons. The previous 5 m point sampler remains only as `calculateSegmentShadeBySampling` for development comparison.

Measured with OpenStreetMap / Overpass on 2026-08-09:

| Departure timestamp | Solar az/el | Buildings | Usable heights | Explicit heights | Floor-derived | Unknown | Segments | Shadow calculations | Shade ratio | Shaded m | Unknown m | Confidence | Latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-08-08T14:00:00.000Z | 96.28 / 29.12 | 43 | 29 | 0 | 29 | 14 | 19 | 551 | 67.87% | 379.7 | 106.7 | 32.74% | 1545 ms |
| 2026-08-08T18:00:00.000Z | 170.84 / 60.75 | 43 | 29 | 0 | 29 | 14 | 19 | 551 | 57.49% | 321.6 | 106.7 | 32.74% | 946 ms |
| 2026-08-08T22:00:00.000Z | 256.35 / 35.52 | 43 | 29 | 0 | 29 | 14 | 19 | 551 | 69.67% | 389.7 | 106.7 | 32.74% | 2130 ms |

The same route produces different environmental shade states at different daylight timestamps. The shadow calculation count is `usable buildings * route segments` because Stage 2.5 evaluates solar position per segment midpoint time.

## OpenStreetMap / Overpass Quality

| Metric | Result |
| --- | --- |
| Building count | 43 |
| Footprints available | 43 |
| Explicit height count | 0 |
| Floor count availability | 29 |
| Unknown height count | 14 |
| Usable-height percentage | 67.44% |
| Building-part support | Query includes `building:part`; normalized provider preserves source IDs, but this corridor returned no explicit measured-height parts. |
| Geometry validity | All 43 returned geometries normalized into Polygon footprints. |
| Fetch/query behavior | Public Overpass works for small development bboxes, with endpoint variability. One alternate endpoint failed during this pass; the default endpoint succeeded. |

OSM is adequate for validating engine boundaries because it supplies real footprints and some floor-derived height data. It is not enough for production-quality shade in this corridor because no explicit heights were present.

## Overture Maps Buildings Quality

Overture Maps Buildings is still the preferred production-scale candidate behind the `BuildingProvider` boundary. The documented buildings theme includes building and building-part records, footprint geometry, and height/floor-related attributes such as height, minimum height, and floor counts.

Same-bbox live querying was not technically practical in the current app runtime because Overture is distributed as release files in cloud object storage, commonly queried through GeoParquet/DuckDB/Python or an ingestion pipeline, rather than a direct Overpass-style bbox API. No Overture adapter was added as the default provider.

| Metric | Result |
| --- | --- |
| Building count | Not measured for this bbox in-app. Requires Overture release ingestion/query pipeline. |
| Footprints available | Supported by schema. Same-bbox correspondence not measured. |
| Explicit height count | Supported by schema, but same-bbox count not measured. |
| Floor count availability | Supported by schema, but same-bbox count not measured. |
| Unknown height count | Not measured. |
| Usable-height percentage | Not measured. |
| Building-part support | Supported by schema as a distinct feature type. |
| Geometry validity | Not measured for the corridor. |
| Fetch/query behavior | Better suited to a backend warehouse/tile pipeline than app-time public HTTP bbox fetches. |

References:

- Overture Buildings guide: https://docs.overturemaps.org/guides/buildings/
- Overture data access docs: https://docs.overturemaps.org/getting-data/
- Overpass QL reference: https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL

## Confidence Audit

Stage 2 produced about 37% confidence for the Minneapolis sample because confidence multiplied average shadow confidence by the share of buildings with usable heights:

```text
average floor-derived shadow confidence * (29 usable buildings / 43 total buildings)
```

That made confidence easy to explain numerically, but it conflated global provider completeness with route-specific uncertainty. It also treated unknown-height buildings as if their unknown status applied to the whole route.

Stage 2.5 reports explicit components:

```ts
type ShadeQuality = {
  geometryCoverage: number;
  heightCoverage: number;
  explicitHeightCoverage: number;
  derivedHeightCoverage: number;
  routeAnalysisCoverage: number;
  overallConfidence: number;
};
```

The current formula is:

```text
heightCoverage = (explicit heights + 0.6 * floor-derived heights) / building count
routeAnalysisCoverage = (route meters - route-adjacent unknown-height uncertainty meters) / route meters
overallConfidence = geometryCoverage * heightCoverage * routeAnalysisCoverage
```

Unknown meters are now geometric: they are the exact route length intersecting buffered influence zones around unknown-height building footprints. This does not claim those meters are shaded. It marks route-adjacent uncertainty where a missing building height could affect the shade estimate.

## Recommendation

Recommendation: **D. Height enrichment required before production-quality shade**, while keeping **A. OSM/Overpass as the development provider**.

Rationale:

- OSM/Overpass is enough to validate engine correctness on small bboxes.
- The Minneapolis corridor had 0 explicit building heights and relied entirely on floor-derived heights for usable shadows.
- Overture should not replace OSM in the live app until ComfortOS has an ingestion/query pipeline and a same-bbox benchmark.
- A future hybrid strategy may be appropriate, but merging OSM and Overture should wait for a documented enrichment policy that preserves height provenance and avoids arbitrary provider blending.

No ADR is added for a provider switch because Stage 2.5 does not change the accepted provider strategy. ADR-004 already states that OSM/Overpass is the Stage 2 development provider and Overture is the preferred production-scale source after ingestion.
