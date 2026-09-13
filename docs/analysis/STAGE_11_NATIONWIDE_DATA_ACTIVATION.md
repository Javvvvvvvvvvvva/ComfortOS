# Stage 11 - Nationwide Data Activation

Date: 2026-09-13
Status: **LOCAL R2 CONTAINER VALIDATED; CLOUDFLARE LIVE BENCHMARK PENDING**

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
- Build a compact Cloudflare staging bundle from verified remote manifests without
  downloading the 99.54 GB building payload.
- Support a release-specific immutable-object mount root while preserving the restored
  durable-volume default.
- Provide an explicit immutable-history rollback command.
- Provide nationwide bundle-capacity and nine-region cold/warm service benchmarks.
- Provide a nine-region application smoke gate that verifies managed routing, live health,
  release metadata, environmental capability, comparable candidates, and credential
  non-exposure through the real application API.

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

The complete suite passes 242/242 tests together with Node and Cloudflare Worker TypeScript,
ESLint, and the dedicated environment-service bundle build.

## Cloudflare Staging Finding

Cloudflare Containers cannot host the accepted archive on instance disk: the largest
current instance has 20 GB of ephemeral disk. A staging package now uses Cloudflare's
documented read-only R2 FUSE path instead. The container image includes only the active
deployment manifest and checksum-addressed nationwide catalog. `tigrisfs` is pinned to
version 1.2.2 and its Linux AMD64 archive SHA-256.

This is a proposed experiment under ADR-028, not a production architecture change. Object
storage FUSE does not promise SSD-like performance. A local native-container probe confirmed
that repeating the full building-file hash causes an 8-second timeout, so the R2-only runtime
trusts the upload-time whole-object verification while retaining manifest and index checks.
Live cold/warm latency and R2 operation amplification must decide whether the experiment is
accepted or rejected.

The verified bundle is 36,866,892 bytes, loads its catalog in 302 ms in the latest local
audit, and uses 89,962,456 bytes of additional heap. Content-checksum deduplication preserves
all 20,758 catalog records while reducing the runtime provider set to 19,036 unique stores; 1,722
cross-jurisdiction border records point to identical Overture content.

A native ARM64 Container probe mounted the production R2 bucket read-only and passed all
nine representative regions. With two rounds per region, cold p95 was 3,957 ms, warm p95 was
46 ms, overall p95 was 3,957 ms, and the maximum was 3,957 ms. The probe returned current
release buildings in Minneapolis, Seattle, Phoenix, Chicago, New York, Miami, Anchorage,
Honolulu, and Washington, DC. Authentication and bearer-token non-exposure checks passed.

The local ComfortOS application was then connected to the authenticated R2-backed service
and exercised through the production API boundary. Minneapolis, Seattle, Phoenix, Chicago,
New York, Miami, Anchorage, Honolulu, and Washington, DC all returned the pinned building
release, `ready` building capability, and at least three comparable route candidates. All
9/9 application requests passed, 35/35 analyzed candidates were comparable, the maximum
response time was 2,451 ms, and provider metadata recorded 45 managed Mapbox requests with
no public OSRM fallback.

That application rehearsal exposed and fixed two previously hidden integration defects.
The building cache now forwards provider metadata and request cancellation. The shade engine
no longer depends on a CommonJS `RBush` path that fails inside the Vinext/Cloudflare worker
bundle; shadow hulls are generated deterministically in the existing local projection and
covered by geometry regression tests. Node and worker execution now produce the same
available shade capability.

The AMD64 image itself builds successfully and is approximately 79.7 MB. TigrisFS crashed
when that AMD64 image was executed through QEMU on the ARM development machine after a
successful mount; the native ARM64 build did not. Cloudflare must therefore validate the
production image on native AMD64 rather than treating the local emulation crash as a provider
result.

## Remaining External Work

1. Authenticate Wrangler and confirm Cloudflare Containers access on the account.
2. Create a dedicated read-only runtime R2 key and set it together with the generated
   environment-service token as Worker secrets.
3. Deploy the staging Container and run the nine-region cold/warm benchmark.
4. Record actual R2 operations, active container duration, and estimated provider cost.
5. Rehearse an immutable deployment rollback and rerun health plus representative queries.
6. Accept ADR-028 only if latency, cost, integrity, and security gates pass; otherwise use a
   durable-volume host under ADR-027.
7. Complete the remaining production security, observability, legal, browser, and mobile
   gates in the MVP release checklist.

## Judgment

READY FOR R2 FUSE STAGING BENCHMARK; PRODUCTION NOT ACTIVATED
