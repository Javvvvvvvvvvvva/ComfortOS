# Stage 10.3 - Illinois Overture Rollout Pilot

Date: 2026-09-03
Status: Chicago metro staging validated; production data host not configured

## Scope

The first incremental multi-state rollout targets the spatial partition containing central
Chicago. This is a metro pilot and is not a claim of Illinois statewide coverage.

```text
partition: us-il-w0351-n0167
bbox: -87.75,41.75,-87.50,42.00
Overture release: 2026-08-19.0
schema: v1.18.0
```

The release was pinned rather than using `latest`. Overture's public release policy retains
only recent data releases, so each rollout artifact records its exact version.

## Build Result

| Metric | Result |
| --- | ---: |
| Extraction time | 264.156 s |
| Intersecting source assets | 1 |
| Buildings | 450,693 |
| Explicit heights | 409,200 |
| Floor-derived heights | 1,788 |
| Unknown heights | 39,705 |
| Usable height ratio | 91.19% |
| Invalid geometries | 0 |
| Building parts | 426 |
| Indexed store size | 238,045,129 bytes |

Source datasets reported by the Overture extract were Microsoft ML Buildings,
OpenStreetMap, and USGS Lidar. The candidate manifest records ODbL-1.0 attribution,
checksums, the exact bbox, and the release.

## Runtime Hardening

The initial provider returned the correct bbox result but parsed all 450,693 records into
memory. ADR-025 adds a 5,408,316-byte random-access index and preserves streaming SHA-256
verification.

| Same Chicago bbox | Before | Indexed |
| --- | ---: | ---: |
| Returned buildings | 482 | 482 |
| Identifier equivalence | baseline | 100% |
| Cold query latency | 1,483 ms | 255 ms |
| Warm query latency | under 20 ms | under 20 ms |
| Service RSS | 840,925,184 bytes | 117,882,880 bytes |

The indexed path reduced measured RSS by 86.0% and cold query latency by 82.8%.

## Route Validation

Three central Chicago route pairs were evaluated with managed Mapbox walking candidates,
the private HTTP Overture provider, and live NWS weather. All three requests succeeded, all
three building queries succeeded, and every analyzed candidate was comparable. Average
end-to-end latency was 1,366 ms.

The same routes were evaluated at 38 C under a controlled sunny summer condition. Heat,
shade, wind, building, routing, and weather capabilities were ready for every route. Average
latency was 391 ms, and candidate shade-ratio ranges reached 10.72 percentage points. Raw
environmental cost ranges reached 14.06, proving that the Chicago geometry affects candidate
analysis. The fastest candidate remained the Comfort selection for these three pairs; the
system did not force an unnecessary alternate.

Rain-cover capability remained unavailable because this pilot deployed building data only.
No building footprint was treated as overhead rain cover.

## Deployment State

The validated store is staged locally under the ignored `data/overture` hierarchy and can be
served through `BUILDING_LOCAL_OVERTURE_STORE_ROOTS`. The repository has no configured R2
bucket, persistent container volume, or private environment-service host, so production data
publication cannot be completed from the current credentials. The rollout registry records
this state as `staging-validated`, not production deployed.

## Judgment

CHICAGO OVERTURE PILOT VALIDATED FOR STAGING

The next production action is to provision durable private storage and an environment-service
host, publish this exact candidate, run protected live health, then promote the deployment
registry without changing the Comfort engine.
