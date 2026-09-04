# Stage 10.5 - State Archive Pipeline

Date: 2026-09-03
Status: Live and verified for the first three jurisdictions

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

All 152 data objects were rehashed locally, uploaded, downloaded from R2, and verified by exact
byte count and SHA-256. The three state archive manifests were uploaded last, for 155 remote
objects in total. The six accepted Stage 10.4 reports cover 18 successful and comparable route
checks.

The live archive contains 38 completed partitions, 2,412,395 buildings, and 1,301,808,891
stored bytes. Compact checkpoints are committed to Git, while the verified local payloads have
been pruned. The nationwide audit retains those totals from the checkpoints and reports all
three jurisdictions as `archived`.

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

STATE ARCHIVE PIPELINE LIVE; NEXT TARGET CONNECTICUT
