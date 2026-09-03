# Stage 10.4 - Nationwide Overture Data Build Checkpoint

Date: 2026-09-03
Status: Three jurisdictions built and validated; deployment intentionally deferred

## Scope

All 50 states and the District of Columbia were replanned against the 2025 Census state
cartographic boundary using the pinned Overture `2026-08-19.0` release. The plans contain
20,758 state-partition assignments representing 19,036 unique 0.25-degree grid cells. The
1,722 duplicate assignments occur where one cell intersects more than one jurisdiction.

This stage builds candidate data only. It does not change production coverage, publish an
environment service, or activate any jurisdiction.

## Completed Data

| Jurisdiction | Partitions | Buildings | Usable height | Stored bytes |
| --- | ---: | ---: | ---: | ---: |
| District of Columbia | 2 / 2 | 678,589 | 78.02% | 369,890,979 |
| Rhode Island | 15 / 15 | 844,819 | 73.75% | 452,787,073 |
| Delaware | 21 / 21 | 888,987 | 80.35% | 479,130,839 |
| Illinois | 1 / 289 | 450,693 | 91.19% | 238,045,129 |
| **Total** | **39 / 20,758** | **2,863,088** | **79.56%** | **1,539,854,020** |

Every completed partition has a pinned source release, bbox, checksums, fixed-width random
access index, and immutable manifest. The progress audit found zero invalid partitions.

Counts describe complete grid cells around the state boundary. They are not state-exclusive
building counts, because edge cells can include nearby buildings across a jurisdiction line.

## Route Validation

Three representative routes per newly completed jurisdiction were run once with live NWS
weather and once with controlled 38 C heat. Managed Mapbox generated the walking candidates,
and the private HTTP provider served the new local Overture stores.

| Jurisdiction | Live routes | Controlled routes | Live average | Controlled average |
| --- | ---: | ---: | ---: | ---: |
| District of Columbia | 3 / 3 | 3 / 3 | 1,554 ms | 496 ms |
| Rhode Island | 3 / 3 | 3 / 3 | 2,345 ms | 1,339 ms |
| Delaware | 3 / 3 | 3 / 3 | 1,759 ms | 615 ms |

All 18 route comparisons loaded buildings successfully and produced comparable candidates.
Rain-cover remained unavailable because only building data was built.

## Build Controls

The new nationwide runner:

1. requires a pinned Overture release and an explicit positive partition limit;
2. processes the smallest jurisdictions first;
3. resumes at the first partition without a completed manifest;
4. accepts any staging data root, including an external volume; and
5. checks a minimum-free-space floor before every partition.

The audit command independently checks plan/manifest/release/bbox agreement, required data
files, checksum declarations, and random-access index length, then writes the versioned
progress registry.

## Storage Gate

The workstation has approximately 10 GiB free after this checkpoint. The observed 39 stores
average about 39.5 MB per state-partition assignment. A linear extrapolation would exceed
800 GB, but it is only a capacity warning because building density varies greatly by region.
The nationwide candidate set cannot fit on the current internal disk.

The next build target is Connecticut, with 37 partitions. Stage 10.5 adds verified
state-by-state R2 archival so completed local states can be pruned before continuing. The
build machine must still retain enough scratch space for one complete state. This storage is
a build workspace, not a production deployment, so the decision to deploy only after all
states are complete remains intact.

## Judgment

NATIONWIDE BUILD PIPELINE VALIDATED; EXTERNAL STAGING STORAGE REQUIRED
