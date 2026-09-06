# Stage 10.5 - State Archive Pipeline

Date: 2026-09-06
Status: Live and verified for the first nineteen jurisdictions

## Scope

Stage 10.5 converts nationwide ingestion into a bounded state lifecycle without activating
production coverage. Code and compact proofs remain in Git; generated Overture payloads are
stored in immutable Cloudflare R2 paths.

## Implemented Contract

`data:buildings:archive-state` refuses archival unless the selected jurisdiction is complete,
every local file matches the partition manifest checksum, and at least one accepted live and
one accepted controlled-weather route report are supplied. Reports must use managed routing,
the private HTTP Overture provider, successful building queries, and comparable candidates.

The command uploads with the R2 S3-compatible API and multipart support. Each new object is
read back and checked against its exact byte count and SHA-256. Existing matching objects are
reused for interrupted runs; an immutable key conflict stops the run. The state archive
manifest is uploaded last.

Only after remote verification does the command write
`config/data-regions/archive-checkpoints/<release>/<state>.json`. Local pruning additionally
requires `--prune true` and the exact confirmation `<STATE>@<RELEASE>`.

The nationwide audit now reports archived jurisdictions, and the rollout runner skips them
after local deletion. Neither command changes production deployment configuration.

## Initial Live Archives

| Jurisdiction | Partitions | Remote objects | Stored bytes | Result |
| --- | ---: | ---: | ---: | --- |
| District of Columbia | 2 | 9 | 369,890,979 | Verified and locally pruned |
| Rhode Island | 15 | 61 | 452,787,073 | Verified and locally pruned |
| Delaware | 21 | 85 | 479,130,839 | Verified and locally pruned |
| Connecticut | 37 | 149 | 1,262,032,738 | Verified and locally pruned |
| New Jersey | 55 | 221 | 2,591,249,796 | Verified and locally pruned |
| Massachusetts | 63 | 253 | 1,757,045,017 | Verified and locally pruned |
| New Hampshire | 65 | 261 | 660,537,168 | Verified and locally pruned |
| Hawaii | 68 | 273 | 191,212,508 | Verified and locally pruned |
| Vermont | 72 | 289 | 441,552,817 | Verified and locally pruned |
| Maryland | 74 | 297 | 2,144,780,546 | Verified and locally pruned |
| West Virginia | 140 | 561 | 929,585,074 | Verified and locally pruned |
| South Carolina | 155 | 621 | 1,879,443,180 | Verified and locally pruned |
| Indiana | 194 | 777 | 2,591,065,028 | Verified and locally pruned |
| Maine | 196 | 785 | 548,504,445 | Verified and locally pruned |
| Kentucky | 215 | 861 | 2,020,142,364 | Verified and locally pruned |
| Ohio | 215 | 861 | 3,676,068,771 | Verified and locally pruned |
| Virginia | 223 | 893 | 2,802,753,659 | Verified and locally pruned |
| Mississippi | 232 | 929 | 1,064,939,897 | Verified and locally pruned |
| Tennessee | 232 | 929 | 2,410,085,057 | Verified and locally pruned |

All 9,096 data objects were rehashed locally, uploaded, downloaded from R2, and verified by exact
byte count and SHA-256. The nineteen state archive manifests were uploaded last, for 9,115 remote
objects in total. The thirty-eight accepted validation reports cover 114 successful and comparable
route checks.

The live archive contains 2,274 completed partitions, 52,866,121 buildings, and 28,272,806,956
stored bytes. Compact checkpoints are committed to Git, while the verified local payloads have
been pruned. The nationwide audit retains those totals from the checkpoints and reports all
nineteen jurisdictions as `archived`.

Connecticut's 37-partition build contains 2,226,878 buildings with 67.71% usable height
coverage. Hartford, New Haven, and Stamford each passed live NWS and controlled 38 C route
validation through managed Mapbox and the private HTTP Overture service. Live validation
averaged 1,466 ms; controlled heat averaged 490 ms. One transient source connection reset was
recovered by the resumable builder without fixture fallback or repeated completed work.

New Jersey's 55-partition build contains 4,870,028 buildings with 89.25% usable height
coverage. Newark, Trenton, and Atlantic City each passed live NWS and controlled 38 C route
validation through managed Mapbox and the private HTTP Overture service. Live validation
averaged 1,350 ms; controlled heat averaged 441 ms. One transient source connection reset was
recovered by the resumable builder. The first live-weather run also encountered a temporary
NWS availability failure; the official endpoint was confirmed healthy and the complete live
suite passed on retry without using mocked weather or fixture fallback.

Massachusetts' 63-partition build contains 3,220,909 buildings with 74.26% usable height
coverage. Boston, Worcester, and Springfield each passed live NWS and controlled 38 C route
validation through managed Mapbox and the private HTTP Overture service. Live validation
averaged 1,520 ms; controlled heat averaged 596 ms. Repeated transient STAC connection
closures were resumed without fixture fallback. The extractor now applies bounded exponential
backoff to official STAC JSON requests; the remaining live build automatically recovered two
consecutive STAC failures without restarting its partition.

New Hampshire's 65-partition build contains 1,224,328 buildings with 77.37% usable height
coverage. Manchester, Concord, and Portsmouth each passed live NWS and controlled 38 C route
validation through managed Mapbox and the private HTTP Overture service. Live validation
averaged 1,468 ms; controlled heat averaged 400 ms. Transient official STAC request failures
were recovered by the bounded retry path without fixture fallback or repeated completed work.

Hawaii's 68-partition build contains 358,918 buildings with 48.06% usable height coverage.
Honolulu, Hilo, and Kahului each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,275 ms;
controlled heat averaged 649 ms. Two transient official STAC request failures were recovered
by the bounded retry path without fixture fallback or repeated completed work.

Vermont's 72-partition build contains 759,478 buildings with 76.91% usable height coverage.
Burlington, Montpelier, and Rutland each passed live NWS and controlled 38 C route validation
through managed Mapbox and the private HTTP Overture service. Live validation averaged 1,255 ms;
controlled heat averaged 383 ms. Two transient official STAC request failures were recovered.
The first R2 archive attempt stopped safely when one object verification request failed, and a
resume exposed an indefinitely stalled response. R2 verification now uses bounded connection,
request, and idle timeouts plus bounded exponential retry. The hardened resume verified all
objects before checkpoint creation and local pruning.

Maryland's 74-partition build contains 3,866,040 buildings with 65.16% usable height coverage.
Baltimore, Annapolis, and Frederick each passed live NWS and controlled 38 C route validation
through managed Mapbox and the private HTTP Overture service. Live validation averaged 1,361 ms;
controlled heat averaged 489 ms. Two transient official STAC request failures were recovered by
the bounded retry path without fixture fallback or repeated completed work. All R2 objects passed
the hardened timeout and verification path on the first archive run.

West Virginia's 140-partition build contains 1,786,970 buildings with 74.46% usable height
coverage. Charleston, Morgantown, and Huntington each passed live NWS and controlled 38 C route
validation through managed Mapbox and the private HTTP Overture service. Live validation
averaged 1,846 ms; controlled heat averaged 783 ms. The build used disjoint partition workers to
reduce elapsed time while retaining per-partition resume and checksum guarantees. All R2 objects
passed the hardened timeout and verification path on the first archive run.

South Carolina's 155-partition build contains 3,594,952 buildings with 67.43% usable height
coverage. Charleston, Columbia, and Greenville each passed live NWS and controlled 38 C route
validation through managed Mapbox and the private HTTP Overture service. Live validation
averaged 1,852 ms; controlled heat averaged 415 ms. The 8 GiB free-space guard stopped the build
safely when local cache pressure crossed the threshold; all 104 completed partitions were kept,
rebuildable npm download cache space was reclaimed, and the build resumed without repeated work.
Transient official STAC and R2 verification requests recovered through bounded retry before all
remote objects were verified and local data was pruned.

Indiana's 194-partition build contains 4,901,114 buildings with 77.72% usable height coverage.
Indianapolis, Fort Wayne, and Evansville each passed live NWS and controlled 38 C route validation
through managed Mapbox and the private HTTP Overture service. Live validation averaged 4,678 ms;
controlled heat averaged 529 ms. Disjoint partition workers reduced build time while preserving
per-partition resume and checksum guarantees. All R2 objects passed the hardened timeout and
verification path on the first archive run before local data was pruned.

Maine's 196-partition build contains 1,066,154 buildings with 72.58% usable height coverage.
Portland, Augusta, and Bangor each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,759 ms;
controlled heat averaged 689 ms. Disjoint partition workers reduced build time while preserving
per-partition resume and checksum guarantees. All R2 objects passed the hardened timeout and
verification path on the first archive run before local data was pruned.

Kentucky's 215-partition build contains 3,819,246 buildings with 74.24% usable height coverage.
Louisville, Lexington, and Bowling Green each passed live NWS and controlled 38 C route validation
through managed Mapbox and the private HTTP Overture service. Live validation averaged 1,577 ms;
controlled heat averaged 600 ms. Disjoint partition workers reduced build time while preserving
per-partition resume and checksum guarantees. Transient official STAC requests recovered through
bounded retry, and one R2 verification request recovered through the hardened retry path before
all remote objects were verified and local data was pruned.

Ohio's 215-partition build contains 6,977,013 buildings with 81.93% usable height coverage.
Columbus, Cleveland, and Cincinnati each passed live NWS and controlled 38 C route validation
through managed Mapbox and the private HTTP Overture service. Live validation averaged 1,408 ms;
controlled heat averaged 441 ms. Disjoint partition workers reduced build time while preserving
per-partition resume and checksum guarantees. The primary worker was stopped once it reached an
active worker range; a complete audit then confirmed all 215 partitions with zero invalid stores.
Transient official STAC requests recovered through bounded retry before all R2 objects were
verified and local data was pruned.

Virginia's 223-partition build contains 5,210,126 buildings with 61.78% usable height coverage.
Richmond, Virginia Beach, and Roanoke each passed live NWS and controlled 38 C route validation
through managed Mapbox and the private HTTP Overture service. Live validation averaged 1,500 ms;
controlled heat averaged 463 ms. Four disjoint partition workers covered the complete state plan
without overlapping writes, and the canonical audit confirmed all 223 partitions with zero
invalid stores. All R2 objects passed the hardened timeout and verification path on the first
archive run before local data was pruned.

Mississippi's 232-partition build contains 2,028,331 buildings with 64.58% usable height coverage.
Jackson, Gulfport, and Tupelo each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,145 ms;
controlled heat averaged 359 ms. Four disjoint partition workers covered the complete state plan
without overlapping writes, and the canonical audit confirmed all 232 partitions with zero
invalid stores. All R2 objects passed the hardened timeout and verification path on the first
archive run before local data was pruned.

Tennessee's 232-partition build contains 4,543,241 buildings with 73.53% usable height coverage.
Nashville, Memphis, and Knoxville each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,305 ms;
controlled heat averaged 363 ms. Four disjoint partition workers covered the complete state plan
without overlapping writes, and the canonical audit confirmed all 232 partitions with zero
invalid stores. Transient official STAC requests recovered through bounded retry before all R2
objects were verified and local data was pruned.

## Credential Verification

The configured R2 account passed a live bucket health check and an isolated put, get,
SHA-256 verification, and delete round trip. The temporary health object was removed. Secret
values remain only in the ignored `.env.local` file and are never written to logs, manifests,
checkpoints, or Git.

Required server-side variables remain:

```dotenv
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=comfortos-environment-data
```

## Judgment

STATE ARCHIVE PIPELINE LIVE; NEXT TARGET ARKANSAS
