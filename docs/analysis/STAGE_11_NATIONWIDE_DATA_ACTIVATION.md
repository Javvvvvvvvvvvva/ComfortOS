# Stage 11 - Nationwide Data Activation

Date: 2026-09-13
Status: **CLOUDFLARE R2 FUSE STAGING ACCEPTED; PRODUCTION RELEASE GATES REMAIN**

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
- Configure Worker secrets from local-only runtime credentials without exposing secret
  values in process arguments or generated Wrangler configuration.
- Route each immutable deployment ID to its own Container Durable Object and synchronize
  that routing key after rollback.
- Permit the active and immediately previous deployment to overlap during a rollback while
  sending application traffic to only the active deployment ID.
- Treat the R2 mount as ready only after a checksum-verified remote partition, tile index,
  offset index, and building object can be read, then supervise both FUSE and Node processes.

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

The complete suite passes 244/244 tests together with Node and Cloudflare Worker TypeScript,
ESLint, and the dedicated environment-service bundle build.

## Cloudflare Staging Finding

Cloudflare Containers cannot host the accepted archive on instance disk: the largest
current instance has 20 GB of ephemeral disk. A staging package now uses Cloudflare's
documented read-only R2 FUSE path instead. The container image includes only the active
deployment manifest and checksum-addressed nationwide catalog. `tigrisfs` is pinned to
version 1.2.2 and its Linux AMD64 archive SHA-256.

This experiment is accepted for the nationwide staging environment under ADR-028. It does
not by itself approve an external production release. The R2-only runtime trusts the
upload-time whole-object verification while retaining manifest and index checks because a
full building-file rehash is incompatible with the request latency gate.

The verified bundle is 36,867,631 bytes, loads its catalog in 251 ms in the latest local
audit, and uses 90,144,224 bytes of additional heap. Content-checksum deduplication preserves
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

The native Cloudflare AMD64 deployment is live at
`https://comfortos-environment-staging.comfortos-staging-57d4f904.workers.dev`.
The final active deployment is `us-2026-08-19.0-r2-fuse-rc1`, Worker version
`d42827cf-5351-421b-848a-f81ed6b8b9a5`, and container image digest
`sha256:afd44e6f4b5f123bd0f4ee8adef53f36f0df84811bb0bad4e4c9fda610218dfb`.

Health reports release `2026-08-19.0`, 51 jurisdictions, and 20,758 stores. The final
three-round benchmark made 30 service requests across Minneapolis, Seattle, Phoenix,
Chicago, New York, Miami, Anchorage, Honolulu, and Washington, DC:

| Metric | Result | Gate |
| --- | ---: | ---: |
| Overall p50 | 143 ms | report only |
| Overall p95 | 1,200 ms | <= 8,000 ms |
| Cold p95 | 1,396 ms | <= 8,000 ms |
| Warm p95 | 181 ms | <= 8,000 ms |
| Maximum | 1,396 ms | <= 8,000 ms |

Every query returned the pinned release and real buildings. The final ComfortOS integration
smoke passed 9/9 regions with 35/35 comparable candidates, 45 managed Mapbox requests, no
public OSRM fallback, and a 3,542 ms maximum application response time. Protected application
health was `ready`; routing, weather, buildings, and managed basemap probes all passed.

## Security And Rollback Evidence

- Only `ENVIRONMENT_QUERY_SERVICE_TOKEN`, `R2_ACCESS_KEY_ID`, and
  `R2_SECRET_ACCESS_KEY` exist as Worker secret bindings; values are not in Wrangler config.
- The runtime R2 key differs from the archive writer key, successfully reads the bucket, and
  receives `403 AccessDenied` on a write probe. No probe object was retained.
- Unauthenticated metadata/building requests return `401`; authenticated representative
  queries return `200`.
- Response scans found no Mapbox, service, health-check, or R2 credential. Cloudflare live
  logs showed the Authorization header as `REDACTED`.
- A real `rc1 -> rc2 -> rc1` rehearsal verified both immutable history entries. rc2 served a
  Phoenix query with 138 buildings. After the active pointer and deployment routing key were
  restored, Cloudflare completed the rollback rollout and rc1 served a Minneapolis query
  with 91 buildings.

The rehearsal exposed three platform integration constraints now enforced in code. Reusing
Cloudflare's default singleton can keep serving the prior image after a rollout, so the
Worker keys the Durable Object by deployment ID. A one-instance limit also prevents the
previous deployment from starting while the replacement waits to sleep, so staging allows
two instances for rollback overlap while routing requests to only one. Finally, a directory
mount check can report ready before remote object reads work. Startup now verifies a complete
remote random-access chain before starting HTTP service and exits if either FUSE or Node dies.

## Operations And Cost

Cloudflare GraphQL Analytics measured the final deployment/benchmark/integration window
rather than estimating FUSE opens. It recorded 20 Class A list operations, 77 successful
range reads, five successful head probes, and two failed head probes. Counting every head
probe gives a conservative Class B upper bound of 84 operations. At current Standard R2
rates, the conservative gross operation cost is about $0.00012 before the monthly included
operations.

The rc2 bundle-preparation window separately recorded 20,851 successful `GetObject`
operations, approximately $0.00751 gross before the included Class B allowance. This cost is
a deployment-control-plane expense and is not counted as per-route runtime amplification.

The day-of-validation container billing snapshot recorded 77.10 CPU seconds, 13,620.00
GiB-seconds of allocated memory, 27,240.00 GB-seconds of allocated disk, and 9.97 MB of
transmit traffic. The provisioned-resource totals correspond to about 3,405 aggregate active
instance-seconds. Gross CPU, memory, and disk cost is approximately $0.0375, but this run remains
inside the Workers Paid monthly CPU, memory, disk, and North America egress allotments.

R2 storage reports 83,083 objects and 99,565,242,781 payload bytes. With Standard storage
billing rounded to 100 GB and the 10 GB monthly free tier, the steady archive estimate is
about $1.35 per month, excluding any other account usage. Operation and container estimates
use Cloudflare's current [R2 pricing](https://developers.cloudflare.com/r2/pricing/) and
[Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/).

## Remaining Production Work

1. Obtain explicit legal/privacy approval; the current release config remains
   `review-pending`.
2. Connect production application telemetry and alerts; the current app config remains on
   console-only observability without configured alerts.
3. Complete the remaining production security, browser, mobile, and release checklist gates.
4. Decide whether to promote this accepted staging architecture or retain ADR-027's
   durable-volume host as the production data plane.

## Judgment

CLOUDFLARE R2 FUSE STAGING VALIDATED; PRODUCTION NOT ACTIVATED
