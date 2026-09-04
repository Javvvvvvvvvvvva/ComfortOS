# Stage 10.5 - State Archive Pipeline

Date: 2026-09-04
Status: Live and verified for the first eight jurisdictions

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

All 1,304 data objects were rehashed locally, uploaded, downloaded from R2, and verified by exact
byte count and SHA-256. The eight state archive manifests were uploaded last, for 1,312 remote
objects in total. The sixteen accepted validation reports cover 48 successful and comparable
route checks.

The live archive contains 326 completed partitions, 14,313,456 buildings, and 7,763,886,118
stored bytes. Compact checkpoints are committed to Git, while the verified local payloads have
been pruned. The nationwide audit retains those totals from the checkpoints and reports all
eight jurisdictions as `archived`.

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

STATE ARCHIVE PIPELINE LIVE; NEXT TARGET VERMONT
