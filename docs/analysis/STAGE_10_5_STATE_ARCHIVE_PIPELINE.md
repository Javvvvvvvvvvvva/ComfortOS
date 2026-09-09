# Stage 10.5 - State Archive Pipeline

Date: 2026-09-09
Status: Live and verified for the first forty-four jurisdictions

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
manifest is uploaded last. Object synchronization uses bounded four-object batches; every object
still completes its preflight inspection and post-upload read-back verification before the next
batch advances. R2 upload and read-back requests both use bounded exponential retry so a transient
object request does not restart the entire state archive.

Only after remote verification does the command write
`config/data-regions/archive-checkpoints/<release>/<state>.json`. Local pruning additionally
requires `--prune true` and the exact confirmation `<STATE>@<RELEASE>`.

The nationwide audit now reports archived jurisdictions, and the rollout runner skips them
after local deletion. Neither command changes production deployment configuration.

The Overture builder removes automatically created extraction work directories after both
successful and failed builds. Caller-supplied work directories remain available for explicit
debugging and inspection.

The private environment query service accepts `BUILDING_QUERY_SERVICE_HOST`, allowing local
validation processes to bind explicitly to `127.0.0.1` instead of exposing the service on every
network interface.

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
| Arkansas | 237 | 949 | 1,051,718,599 | Verified and locally pruned |
| Pennsylvania | 244 | 977 | 4,056,494,152 | Verified and locally pruned |
| Alabama | 245 | 981 | 1,835,357,007 | Verified and locally pruned |
| Louisiana | 251 | 1,005 | 1,467,418,657 | Verified and locally pruned |
| Georgia | 276 | 1,105 | 2,697,093,151 | Verified and locally pruned |
| North Carolina | 277 | 1,109 | 3,518,904,941 | Verified and locally pruned |
| Illinois | 289 | 1,157 | 3,694,201,828 | Verified and locally pruned |
| Florida | 296 | 1,185 | 4,561,470,840 | Verified and locally pruned |
| New York | 297 | 1,189 | 4,482,413,621 | Verified and locally pruned |
| Iowa | 300 | 1,201 | 1,576,464,401 | Verified and locally pruned |
| Wisconsin | 320 | 1,281 | 2,467,085,784 | Verified and locally pruned |
| Oklahoma | 339 | 1,357 | 1,517,576,141 | Verified and locally pruned |
| Missouri | 363 | 1,453 | 2,251,772,550 | Verified and locally pruned |
| Nebraska | 376 | 1,505 | 805,520,669 | Verified and locally pruned |
| Michigan | 378 | 1,513 | 3,212,568,079 | Verified and locally pruned |
| North Dakota | 398 | 1,593 | 433,596,955 | Verified and locally pruned |
| Utah | 402 | 1,609 | 777,116,045 | Verified and locally pruned |
| Washington | 403 | 1,613 | 2,689,803,781 | Verified and locally pruned |
| South Dakota | 413 | 1,653 | 472,605,051 | Verified and locally pruned |
| Kansas | 425 | 1,701 | 1,172,589,825 | Verified and locally pruned |
| Idaho | 463 | 1,853 | 680,756,862 | Verified and locally pruned |
| Minnesota | 469 | 1,877 | 1,913,672,442 | Verified and locally pruned |
| Wyoming | 500 | 2,001 | 272,499,454 | Verified and locally pruned |
| Oregon | 510 | 2,041 | 1,416,637,101 | Verified and locally pruned |
| Arizona | 511 | 2,045 | 1,964,699,620 | Verified and locally pruned |

All 45,024 data objects were rehashed locally, uploaded, downloaded from R2, and verified by exact
byte count and SHA-256. The forty-four state archive manifests were uploaded last, for 45,068 remote
objects in total. The eighty-eight accepted validation reports cover 264 successful and comparable
route checks.

The live archive contains 11,256 completed partitions, 149,261,100 buildings, and 79,262,844,512
stored bytes. Compact checkpoints are committed to Git, while the verified local payloads have
been pruned. The nationwide audit retains those totals from the checkpoints and reports all
forty-four jurisdictions as `archived`.

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

Arkansas' 237-partition build contains 1,999,188 buildings with 76.74% usable height coverage.
Little Rock, Fayetteville, and Fort Smith each passed live NWS and controlled 38 C route validation
through managed Mapbox and the private HTTP Overture service. Live validation averaged 1,362 ms;
controlled heat averaged 601 ms. Four disjoint partition workers covered the complete state plan
without overlapping writes, and the canonical audit confirmed all 237 partitions with zero
invalid stores. Transient official STAC requests recovered through bounded retry before all R2
objects were verified and local data was pruned.

Pennsylvania's 244-partition build contains 7,683,897 buildings with 76.93% usable height coverage.
Pittsburgh, Harrisburg, and Philadelphia each passed live NWS and controlled 38 C route validation
through managed Mapbox and the private HTTP Overture service. Live validation averaged 1,446 ms;
controlled heat averaged 403 ms. Four disjoint partition workers covered the complete state plan
without overlapping writes, and the canonical audit confirmed all 244 partitions with zero
invalid stores. Transient official STAC requests recovered through bounded retry before all R2
objects were verified and local data was pruned.

Alabama's 245-partition build contains 3,428,780 buildings with 66.20% usable height coverage.
Birmingham, Montgomery, and Mobile each passed live NWS and controlled 38 C route validation
through managed Mapbox and the private HTTP Overture service. Live validation averaged 1,323 ms;
controlled heat averaged 392 ms. Four disjoint partition workers covered the complete state plan
without overlapping writes, and the canonical audit confirmed all 245 partitions with zero
invalid stores. Transient official STAC requests recovered through bounded retry before all R2
objects were verified and local data was pruned.

Louisiana's 251-partition build contains 2,755,468 buildings with 82.56% usable height coverage.
New Orleans, Baton Rouge, and Shreveport each passed live NWS and controlled 38 C route validation
through managed Mapbox and the private HTTP Overture service. Live validation averaged 1,455 ms;
controlled heat averaged 466 ms. Four disjoint partition workers covered the complete state plan
without overlapping writes, and the canonical audit confirmed all 251 partitions with zero
invalid stores. Transient official STAC requests recovered through bounded retry. An interrupted
R2 archive resumed by reusing 697 already verified objects before all remote objects were verified
and local data was pruned.

Georgia's 276-partition build contains 5,196,805 buildings with 74.39% usable height coverage.
Atlanta, Augusta, and Savannah each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,608 ms; controlled
heat averaged 471 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 276 partitions with zero invalid stores.
All R2 objects passed remote byte-count and SHA-256 verification before local data was pruned.

North Carolina's 277-partition build contains 6,753,655 buildings with 66.07% usable height
coverage. Raleigh, Charlotte, and Asheville each passed live NWS and controlled 38 C route
validation through managed Mapbox and the private HTTP Overture service. Live validation averaged
1,256 ms; controlled heat averaged 415 ms. Four disjoint partition workers covered the complete
state plan without overlapping writes, and the canonical audit confirmed all 277 partitions with
zero invalid stores. All R2 objects passed verification before local data was pruned.

Illinois's 289-partition build contains 7,011,707 buildings with 81.80% usable height coverage.
Chicago, Springfield, and Peoria each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,629 ms; controlled
heat averaged 346 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 289 partitions with zero invalid stores.
All R2 objects passed remote byte-count and SHA-256 verification before local data was pruned.

Florida's 296-partition build contains 8,492,101 buildings with 68.57% usable height coverage.
Miami, Tallahassee, and Orlando each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,365 ms; controlled
heat averaged 348 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 296 partitions with zero invalid stores.
Transient official STAC failures recovered through bounded retry. All R2 objects passed remote
byte-count and SHA-256 verification before local data was pruned.

New York's 297-partition build contains 8,482,317 buildings with 78.60% usable height coverage.
New York City, Albany, and Buffalo each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,454 ms; controlled
heat averaged 606 ms. The controlled heat run selected a comfort route distinct from the fastest
route for one city. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 297 partitions with zero invalid stores.
Transient official STAC failures recovered through bounded retry. All R2 objects passed remote
byte-count and SHA-256 verification before local data was pruned.

Iowa's 300-partition build contains 2,983,268 buildings with 66.29% usable height coverage. Des
Moines, Cedar Rapids, and Davenport each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,453 ms; controlled
heat averaged 506 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 300 partitions with zero invalid stores.
Transient official STAC failures recovered through bounded retry. All R2 objects passed remote
byte-count and SHA-256 verification before local data was pruned.

Wisconsin's 320-partition build contains 4,624,194 buildings with 76.17% usable height coverage.
Milwaukee, Madison, and Green Bay each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,406 ms; controlled
heat averaged 537 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 320 partitions with zero invalid stores.
All R2 objects passed remote byte-count and SHA-256 verification before local data was pruned.

Oklahoma's 339-partition build contains 2,853,479 buildings with 69.80% usable height coverage.
Oklahoma City, Tulsa, and Norman each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,615 ms; controlled
heat averaged 525 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 339 partitions with zero invalid stores.
Transient official STAC failures recovered through bounded retry. All R2 objects passed remote
byte-count and SHA-256 verification before local data was pruned.

Missouri's 363-partition build contains 4,352,966 buildings with 76.00% usable height coverage.
Jefferson City, St. Louis, and Kansas City each passed live NWS and controlled 38 C route validation
through managed Mapbox and the private HTTP Overture service. Live validation averaged 1,433 ms;
controlled heat averaged 418 ms. Four disjoint partition workers covered the complete state plan
without overlapping writes, and the canonical audit confirmed all 363 partitions with zero invalid
stores. Transient official STAC failures recovered through bounded retry. All R2 objects passed
remote byte-count and SHA-256 verification before local data was pruned.

Nebraska's 376-partition build contains 1,513,417 buildings with 66.54% usable height coverage.
Omaha, Lincoln, and Grand Island each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 2,851 ms; controlled
heat averaged 407 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 376 partitions with zero invalid stores.
Transient official STAC failures recovered through bounded retry. All R2 objects passed remote
byte-count and SHA-256 verification before local data was pruned.

Michigan's 378-partition build contains 6,218,779 buildings with 84.76% usable height coverage.
Detroit, Lansing, and Grand Rapids each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,469 ms; controlled
heat averaged 731 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 378 partitions with zero invalid stores.
All R2 objects passed remote byte-count and SHA-256 verification before local data was pruned.

North Dakota's 398-partition build contains 834,687 buildings with 41.21% usable height coverage.
Fargo, Bismarck, and Grand Forks each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,287 ms; controlled
heat averaged 453 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 398 partitions with zero invalid stores.
All R2 objects passed remote byte-count and SHA-256 verification before local data was pruned.

Utah's 402-partition build contains 1,403,193 buildings with 70.97% usable height coverage. Salt
Lake City, Provo, and St. George each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,240 ms; controlled
heat averaged 387 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 402 partitions with zero invalid stores.
All R2 objects passed remote byte-count and SHA-256 verification before local data was pruned.

Washington's 403-partition build contains 4,868,833 buildings with 77.12% usable height coverage.
Seattle, Spokane, and Tacoma each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,872 ms; controlled
heat averaged 482 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 403 partitions with zero invalid stores.
All R2 objects passed remote byte-count and SHA-256 verification before local data was pruned.

South Dakota's 413-partition build contains 909,958 buildings with 62.86% usable height coverage.
Sioux Falls, Pierre, and Rapid City each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,302 ms; controlled
heat averaged 376 ms. Four disjoint partition workers covered the state plan, and a post-build audit
identified four partitions omitted by undersized worker limits. A resumable targeted pass completed
those partitions without repeating finished work; the canonical audit then confirmed all 413
partitions with zero invalid stores. All R2 objects passed remote byte-count and SHA-256 verification
before local data was pruned.

Kansas's 425-partition build contains 2,263,955 buildings with 67.73% usable height coverage.
Wichita, Topeka, and Lawrence each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,478 ms; controlled
heat averaged 450 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 425 partitions with zero invalid stores.
One transient official STAC failure recovered through bounded retry. All R2 objects passed remote
byte-count and SHA-256 verification before local data was pruned.

Idaho's 463-partition build contains 1,293,363 buildings with 71.53% usable height coverage.
Boise, Idaho Falls, and Twin Falls each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,505 ms; controlled
heat averaged 563 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 463 partitions with zero invalid stores.
One transient R2 verification request recovered through bounded retry. All R2 objects passed remote
byte-count and SHA-256 verification before local data was pruned.

Minnesota's 469-partition build contains 3,662,860 buildings with 75.52% usable height coverage.
Minneapolis, Saint Paul, and Duluth each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,530 ms; controlled
heat averaged 598 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the resumable build retained 89 completed partitions across a process restart
without fixture fallback. The canonical audit confirmed all 469 partitions with zero invalid stores.
All R2 objects passed remote byte-count and SHA-256 verification before local data was pruned.

Wyoming's 500-partition build contains 530,285 buildings with 47.18% usable height coverage.
Cheyenne, Casper, and Laramie each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,262 ms; controlled
heat averaged 390 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 500 partitions with zero invalid stores.
All 2,001 R2 objects passed remote byte-count and SHA-256 verification before local data was pruned.

Oregon's 510-partition build contains 2,597,633 buildings with 78.28% usable height coverage.
Portland, Eugene, and Bend each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 1,696 ms; controlled
heat averaged 402 ms. Four disjoint partition workers covered the complete state plan without
overlapping writes, and the canonical audit confirmed all 510 partitions with zero invalid stores.
One transient official STAC failure recovered through bounded retry without fixture fallback. All
2,041 R2 objects passed remote byte-count and SHA-256 verification before local data was pruned.

Arizona's 511-partition build contains 3,680,191 buildings with 71.60% usable height coverage.
Phoenix, Tucson, and Flagstaff each passed live NWS and controlled 38 C route validation through
managed Mapbox and the private HTTP Overture service. Live validation averaged 2,292 ms; controlled
heat averaged 1,229 ms. Four disjoint resumable workers covered the complete state plan despite
intermittent official STAC and Overture S3 DNS failures, without fixture fallback. The first live
route attempt also encountered a transient Mapbox timeout; managed provider health returned ready
before the accepted retry. The canonical audit confirmed all 511 partitions with zero invalid
stores. The archive resumed after two transient object upload failures, reused 859 verified objects,
uploaded 1,186 remaining objects, and verified all 2,045 R2 objects before local data was pruned.

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

STATE ARCHIVE PIPELINE LIVE; NEXT TARGET COLORADO
