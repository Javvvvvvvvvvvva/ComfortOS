# Stage 10.5 - State Archive Pipeline

Date: 2026-09-03
Status: Pipeline validated; remote credentials required

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

## Existing-State Dry Runs

| Jurisdiction | Partitions | Data objects | Stored bytes | Result |
| --- | ---: | ---: | ---: | --- |
| District of Columbia | 2 | 8 | 369,890,979 | Passed |
| Rhode Island | 15 | 60 | 452,787,073 | Passed |
| Delaware | 21 | 84 | 479,130,839 | Passed |

All 152 partition files were rehashed locally. The six accepted Stage 10.4 reports cover 18
successful and comparable route checks. No upload or deletion occurred during dry-run.

## Credential Gate

The current environment has no configured R2 account, S3 access key, secret access key, or
bucket. No archive checkpoint is accepted until a real remote upload and read-back succeeds.
The existing 1.54 GB of local Overture data remains intact.

Required server-side variables:

```dotenv
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=comfortos-environment-data
```

## Judgment

STATE ARCHIVE PIPELINE READY; REMOTE STORAGE CREDENTIALS REQUIRED
