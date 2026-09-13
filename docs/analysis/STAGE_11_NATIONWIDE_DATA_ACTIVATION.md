# Stage 11 - Nationwide Data Activation

Date: 2026-09-13
Status: **RESTORE TOOLING AND LIVE R2 PREFLIGHT COMPLETE; PRODUCTION NOT ACTIVATED**

## Objective

Promote the complete Stage 10.5 United States archive toward the private production
environment service without confusing object-storage durability with live application
coverage. This checkpoint implements and validates the repository-contained restore and
activation controls. It does not download the roughly 100 GB release to the development
workstation and does not begin a production rollout.

## Implemented Contract

- Added a resumable R2-to-durable-volume restore command.
- Added local planning and remote-manifest-only preflight modes.
- Require an exact pinned release confirmation before downloading partition payloads.
- Check available capacity against missing object bytes plus a configurable free-space
  floor before restore begins.
- Download through temporary files at bounded concurrency and publish a local object only
  after exact byte-count and SHA-256 verification.
- Reuse an existing local object only after rehashing it; reject mismatched local content.
- Preserve a verified state manifest and immutable state restore receipt.
- Generate one bounded nationwide building-store catalog with partition bounds and manifest
  provenance.
- Require an explicit deployment identifier and confirmation before activation.
- Snapshot every active catalog under its SHA-256, preserve immutable deployment history,
  and atomically replace `production-active.json`.
- Allow the environment service to load the verified active catalog directly instead of
  recursively discovering and reading all partition manifests at startup.
- Reverify a selected partition's on-disk manifest before its building data is loaded.

## Nationwide Evidence

The local dry-run reconciled the 51 Git-tracked archive checkpoints:

| Metric | Result |
| --- | ---: |
| Jurisdictions | 51 |
| Partitions | 20,758 |
| Data objects | 83,032 |
| Stored bytes | 99,541,442,479 |
| Buildings | 186,043,651 |

The live Cloudflare R2 preflight then downloaded all 51 remote state completion manifests.
Every manifest matched its checkpoint SHA-256, pinned release, jurisdiction, object keys,
partition count, object count, and stored-byte total. The preflight read no partition
payloads and exposed no credential values.

## Safety And Regression Tests

Deterministic tests cover:

- remote state-manifest checksum rejection;
- restore confirmation and capacity gates;
- exact verified download and verified local reuse;
- resumable catalog generation;
- activation confirmation and required-jurisdiction gates;
- immutable catalog snapshots and deployment history;
- active catalog checksum rejection;
- selected partition-manifest checksum rejection; and
- catalog-backed provider metadata without nationwide manifest discovery.

The complete suite passes 232/232 tests together with TypeScript, ESLint, the Vinext
production build, and the dedicated environment-service bundle build.

## Remaining External Work

1. Provision a production or staging environment-service host with a durable volume large
   enough for the 99.54 GB payload plus operational headroom.
2. Run the full restore on that host and retain its generated catalog and receipts.
3. Measure service startup, memory, cold/warm partition access, concurrent load, and cache
   behavior across representative states.
4. Run nationwide bbox, state-boundary, unsupported-region, and route-comparison smoke tests.
5. Activate a release candidate, start the private service from its active manifest, and
   rehearse a catalog/data rollback before directing beta traffic to it.
6. Complete the remaining production security, observability, legal, browser, and mobile
   gates in the MVP release checklist.

## Judgment

READY FOR DURABLE-VOLUME RESTORE; PRODUCTION NOT ACTIVATED
