# Environment Query Service Deployment

Date: 2026-09-02

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

Required runtime configuration:

```dotenv
BUILDING_LOCAL_OVERTURE_STORE_DIRS=/data/minneapolis,/data/seattle,/data/phoenix
ENVIRONMENT_QUERY_SERVICE_TOKEN=<private-random-token>
PORT=8787
```

For partitioned multi-state deployments, point the service at one or more roots instead of
listing every store:

```dotenv
BUILDING_LOCAL_OVERTURE_STORE_ROOTS=/data/us
```

The service recursively discovers directories containing `manifest.json`. Multiple roots
are comma-separated; explicit store directories and roots may be used together.

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

The provider rejects a store when a recorded content checksum does not match.
Only partition manifests are read during coverage discovery. Building and tile-index files
are loaded on demand, and the service retains at most the configured number of recently used
stores in memory. This boundary is required before adding statewide or nationwide partition
sets.

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
