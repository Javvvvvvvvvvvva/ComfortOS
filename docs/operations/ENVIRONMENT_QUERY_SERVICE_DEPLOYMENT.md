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
