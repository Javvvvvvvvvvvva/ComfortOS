# Environment Query Service Deployment

Date: 2026-09-02
Updated: 2026-09-13

## Purpose

The ComfortOS application worker must not read Overture or covered-feature files directly.
The environment query service is the private HTTP boundary for immutable building stores and
the optional reviewed covered-feature dataset.

## Container

Build the dedicated image from the repository root:

```bash
docker build -f Dockerfile.environment-service -t comfortos-environment-service .
```

Mount immutable, read-only data volumes. Do not copy production datasets into the application
repository or image.

Required runtime configuration for an activated release:

```dotenv
ENVIRONMENT_ACTIVE_DEPLOYMENT_MANIFEST=/data/comfortos/deployments/production-active.json
ENVIRONMENT_QUERY_SERVICE_TOKEN=<private-random-token>
PORT=8787
```

The active deployment manifest points to a checksum-addressed catalog and is the production
path for partitioned nationwide data. Explicit directories and recursive roots remain
available for development and small staging datasets:

```dotenv
BUILDING_LOCAL_OVERTURE_STORE_DIRS=/data/minneapolis,/data/seattle,/data/phoenix
# or
BUILDING_LOCAL_OVERTURE_STORE_ROOTS=/data/us
```

The service recursively discovers directories containing `manifest.json`. Multiple roots
are comma-separated; explicit store directories and roots may be used together. They cannot
be combined with `ENVIRONMENT_ACTIVE_DEPLOYMENT_MANIFEST`.

The production process refuses to start without `ENVIRONMENT_QUERY_SERVICE_TOKEN`. The
runtime image contains one bundled service module and no npm development toolchain.

Optional Seattle cover configuration:

```dotenv
COVERED_FEATURE_STATIC_GEOJSON=/data/seattle-covered-features.geojson
COVERED_FEATURE_REGION=seattle-preview
```

Recommended limits:

```dotenv
ENVIRONMENT_QUERY_SERVICE_MAX_BBOX_SPAN_DEGREES=0.25
ENVIRONMENT_QUERY_SERVICE_TIMEOUT_MS=8000
ENVIRONMENT_QUERY_SERVICE_MAX_LOADED_STORES=8
BUILDING_QUERY_SERVICE_MAX_BUILDINGS=25000
COVERED_FEATURE_QUERY_SERVICE_MAX_FEATURES=10000
```

## Network Boundary

- Terminate TLS at the service ingress.
- Permit application-to-service traffic only.
- Keep `/health` available to the platform probe without returning coordinates or file paths.
- Require the bearer token for metadata, building, and covered-feature queries.
- Send the same token from the application through `BUILDING_QUERY_SERVICE_TOKEN` and
  `COVERED_FEATURE_QUERY_SERVICE_TOKEN`.
- Apply ingress request-rate and response-size limits in addition to application limits.

## Data Activation

1. Generate each store from an explicit Overture release.
2. Verify manifest source, release, license, bbox, counts, and SHA-256 checksums.
3. Upload the versioned store without overwriting the previous version.
4. Mount the candidate release read-only in staging.
5. Run bbox, unsupported-region, load, and three-region smoke tests.
6. Switch the active mount or manifest atomically.
7. Keep the previous release mounted or immediately recoverable for rollback.

The provider rejects a store when a recorded content checksum does not match. An active
nationwide catalog supplies verified partition bounds without recursively discovering or
reading all partition manifests at service startup. The selected partition manifest,
building file, and indexes remain checksum-verified before use. Data files are loaded on
demand, and the service retains at most the configured number of recently used stores in
memory.

New stores include `building-offsets.bin`, a fixed-width random-access index. On first use,
the service streams the full building file through SHA-256 verification, loads only the tile
and offset indexes, and reads the requested building records by byte position. It does not
parse the full building collection into memory. Convert an older candidate store before
activation with:

```bash
npm run data:buildings:index -- --store /data/us/il/release/partition
```

The conversion writes the offset file before atomically replacing the manifest. Run it on a
candidate version, never directly on the currently active production mount.

## State Partition Planning

The nationwide catalog is derived from the Census Bureau state cartographic boundary file.
Create exact boundary-intersecting plans without downloading Overture data:

```bash
python3 -m venv .venv
.venv/bin/pip install duckdb
npm run data:buildings:plan:states -- --states all
```

Build a deliberately bounded batch from one generated plan:

```bash
npm run data:buildings:state -- \
  --plan /tmp/comfortos-us-state-partitions/il/state-plan.json \
  --max-partitions 4 \
  --release 2026-08-19.0 \
  --resume true
```

Use `--dry-run true` to inspect the exact partition identifiers first. A positive
`--max-partitions` value is mandatory; full-state or nationwide downloads are never the
default. Publish completed stores through an atomic manifest or mount switch only after
quality, latency, and cost gates pass.

For long-running multi-state candidate builds, use the bounded rollout runner rather than
manually increasing a state's prefix limit:

```bash
npm run data:buildings:rollout -- \
  --plan-root /data/comfortos/plans/<release> \
  --data-root /data/comfortos/overture/us \
  --release <pinned-release> \
  --max-partitions 10 \
  --minimum-free-bytes 8589934592 \
  --archive-checkpoint-root config/data-regions/archive-checkpoints
```

The runner orders jurisdictions from the fewest planned partitions to the most, skips every
store with a completed manifest, and stops before starting another partition when available
storage is below the configured floor. `--dry-run true` reports the exact next partitions.
Candidate construction does not update application coverage or activate deployment.

Record an auditable checkpoint with:

```bash
npm run data:buildings:audit -- \
  --plan-root /data/comfortos/plans/<release> \
  --data-root /data/comfortos/overture/us \
  --release <pinned-release> \
  --archive-checkpoint-root config/data-regions/archive-checkpoints \
  --output config/data-regions/build-progress/overture-<release>.json
```

After a jurisdiction is fully built and has accepted live plus controlled route reports,
archive it before starting the next jurisdiction:

```bash
npm run data:buildings:archive-state -- \
  --state <STATE> \
  --release <pinned-release> \
  --plan-root /data/comfortos/plans/<release> \
  --data-root /data/comfortos/overture/us \
  --validation-reports /tmp/<state>-live.json,/tmp/<state>-controlled.json \
  --provider r2 \
  --prefix overture-buildings \
  --checkpoint-root config/data-regions/archive-checkpoints \
  --prune true \
  --confirm-prune <STATE>@<release>
```

The archive command automatically loads `.env.local` unless `--env-file` selects another
file. It requires `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
`R2_BUCKET`. Credentials are never written to output. Uploads use the S3-compatible API and
multipart transfer; every object is then downloaded and SHA-256 verified. The remote state
manifest is the final completion marker. A conflicting existing object stops the run, and
local data remains untouched on every failure before the prune checkpoint.

Use `--dry-run true` without R2 credentials to validate the local state, route reports,
object list, byte counts, and deterministic state-manifest hash. The resulting archive
checkpoint is source-control metadata, not a production activation record.

## Nationwide Restore And Activation

Inspect the complete restore plan without making an R2 request:

```bash
npm run data:buildings:restore-release -- \
  --release 2026-08-19.0 \
  --states all \
  --checkpoint-root config/data-regions/archive-checkpoints \
  --target-root /data/comfortos \
  --dry-run true
```

Preflight only the 51 remote completion manifests before reserving a large deployment
volume. This reads no partition payloads:

```bash
npm run data:buildings:restore-release -- \
  --release 2026-08-19.0 \
  --states all \
  --checkpoint-root config/data-regions/archive-checkpoints \
  --target-root /data/comfortos \
  --provider r2 \
  --preflight true
```

Restore the release to a durable volume only after capacity has been provisioned. The
command requires an exact release confirmation, preserves a 5 GiB free-space floor by
default, downloads at bounded concurrency, verifies every byte and SHA-256, and reuses only
matching local objects after an interruption:

```bash
npm run data:buildings:restore-release -- \
  --release 2026-08-19.0 \
  --states all \
  --checkpoint-root config/data-regions/archive-checkpoints \
  --target-root /data/comfortos \
  --provider r2 \
  --confirm-restore 2026-08-19.0
```

The restore produces:

```text
/data/comfortos/
  releases/2026-08-19.0/
    building-store-catalog.json
    us/<state>/<partition-id>/
  deployments/
```

Validate activation first, then activate with an immutable deployment identifier:

```bash
npm run data:buildings:activate-release -- \
  --target-root /data/comfortos \
  --release 2026-08-19.0 \
  --deployment-id us-2026-08-19.0-rc1 \
  --dry-run true

npm run data:buildings:activate-release -- \
  --target-root /data/comfortos \
  --release 2026-08-19.0 \
  --deployment-id us-2026-08-19.0-rc1 \
  --confirm-activation us-2026-08-19.0-rc1
```

Activation requires 51 jurisdictions by default, verifies every cataloged partition
manifest, snapshots the catalog under its SHA-256, preserves immutable deployment history,
and atomically writes `deployments/production-active.json`. Restart the environment service
after an activation or rollback. Never point production at the mutable restore candidate
catalog directly.

Store restored candidates under the durable release path:

```text
/data/comfortos/releases/<release>/us/<state>/<partition-id>/
```

Keep the previous release and deployment history intact until the new release has passed
service health, representative bbox, route-comparison, memory, and rollback checks.

## Cloudflare R2 FUSE Staging Candidate

Cloudflare Container disk is ephemeral and currently limited to 20 GB per instance, so it
cannot hold the 99.54 GB nationwide restore. ADR-028 defines a staging-only alternative that
mounts the immutable R2 bucket read-only and bundles only verified catalog metadata. Do not
treat this path as production-ready before its latency and cost gates pass.

Prepare the small deployment bundle without downloading building payloads:

```bash
npm run environment:cloudflare:prepare -- \
  --release 2026-08-19.0 \
  --deployment-id us-2026-08-19.0-r2-fuse-rc1 \
  --confirm-build us-2026-08-19.0-r2-fuse-rc1

npm run environment:cloudflare:audit-bundle
npm run environment:cloudflare:typecheck
```

The prepare command verifies the 51 remote state manifests and every partition manifest
against Git-tracked archive checkpoints. It writes ignored build artifacts under
`deploy/cloudflare-environment/generated/` and an ignored Wrangler config containing only
non-secret account, bucket, and release values.

Before deployment, authenticate Wrangler and keep these local values in `.env.local` without
writing them to the generated config:

```text
ENVIRONMENT_QUERY_SERVICE_TOKEN
R2_RUNTIME_ACCESS_KEY_ID
R2_RUNTIME_SECRET_ACCESS_KEY
```

Use a dedicated runtime R2 key limited to object read access for this bucket. Do not reuse
the archive writer key inside the internet-facing staging runtime. Configure the Worker
secret bindings without exposing values on the command line or in logs:

```bash
npm run environment:cloudflare:configure-secrets
```

The helper validates that the runtime credential has the expected R2 S3 format and differs
from the archive writer credential. It maps the local `R2_RUNTIME_*` names to the container's
`R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` Worker bindings.

Set `BUILDING_QUERY_SERVICE_TIMEOUT_MS=8000` on the ComfortOS application when it uses this
service. The protected live-health probe uses the same bound, so a healthy first request is
not rejected earlier than the Stage 11 cold-latency gate.

The container uses a checksum-pinned `tigrisfs` binary and mounts R2 with `allow_other,ro`.
The Worker keys each container Durable Object by the immutable deployment ID so an image
rollout or rollback cannot keep serving a previous deployment through a reused singleton.
The staging application permits two instances so the active and immediately previous
deployment can overlap during a rollback; only the active deployment ID receives requests.
Startup does not treat the FUSE directory alone as ready. It checksum-verifies one remote
partition manifest, parses its tile index, opens its offset and building objects, and then
supervises both the mount process and Node service for the container lifetime.
It passes a release-specific `ENVIRONMENT_DEPLOYMENT_STORE_ROOT` and skips 20,758 eager
filesystem `stat` calls. The selected partition manifest, tile index, and offset index are
still verified on first use. `ENVIRONMENT_TRUST_VERIFIED_ARCHIVE_DATA=true` skips only the
full building-file rehash because archival already verified the complete remote object. This
flag is rejected unless the active catalog source is Cloudflare R2.

After staging is reachable, run:

```bash
npm run environment:cloudflare:benchmark -- \
  --url https://<environment-worker>.workers.dev \
  --rounds 3 \
  --output docs/analysis/generated/environment-r2-fuse-benchmark.json
```

After configuring the ComfortOS application to use that service, validate the application
boundary separately:

```bash
npm run smoke:stage11:nationwide -- \
  --base-url https://<comfortos-app> \
  --release 2026-08-19.0 \
  --output docs/analysis/generated/stage-11-nationwide-app-smoke.json
```

This gate requires live application health, managed production routing metadata, the pinned
building release, successful building queries, and comparable candidates in nine distributed
regions. It also rejects any response containing a configured Mapbox, environment-service,
health-check, or R2 credential.

The benchmark covers Minneapolis, Seattle, Phoenix, Chicago, New York, Miami, Anchorage,
Honolulu, and Washington, DC. It enforces authentication, checks for bearer-token exposure,
separates cold and warm latency, and applies the 8-second p95 gate. Its estimated R2 object
opens are only a lower bound; record actual FUSE metadata/range operations and active
container duration from Cloudflare metrics before acceptance.

Rollback an active bundle pointer only to an existing immutable history record:

```bash
npm run data:buildings:rollback-release -- \
  --target-root /data/comfortos \
  --deployment-id <previous-deployment-id> \
  --dry-run true

npm run data:buildings:rollback-release -- \
  --target-root /data/comfortos \
  --deployment-id <previous-deployment-id> \
  --confirm-rollback ROLLBACK:<previous-deployment-id>
```

For the Cloudflare R2 FUSE bundle, use its generated deployment root, then synchronize the
Worker's deployment-keyed container routing before auditing and redeploying:

```bash
npm run data:buildings:rollback-release -- \
  --target-root deploy/cloudflare-environment/generated/deployment \
  --deployment-id <previous-deployment-id> \
  --confirm-rollback ROLLBACK:<previous-deployment-id>
npm run environment:cloudflare:sync-config
npm run environment:cloudflare:audit-bundle
npm run environment:cloudflare:deploy -- --containers-rollout=immediate
```

## Application Configuration

```dotenv
BUILDING_PROVIDER=building-query-service
BUILDING_QUERY_SERVICE_URL=https://environment-data.example.com
BUILDING_QUERY_SERVICE_TOKEN=<private-random-token>
```

Enable rain-cover claims only after the reviewed dataset is active:

```dotenv
REQUIRE_RAIN_COVER=true
COVERED_FEATURE_PROVIDER=covered-query-service
COVERED_FEATURE_QUERY_SERVICE_URL=https://environment-data.example.com
COVERED_FEATURE_QUERY_SERVICE_TOKEN=<private-random-token>
```

Keep `REQUIRE_RAIN_COVER=false` and the consumer capability unavailable when this service or
its reviewed coverage is not active.
