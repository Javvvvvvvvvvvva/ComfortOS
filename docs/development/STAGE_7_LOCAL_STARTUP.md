# Stage 7 Local Startup

Date: 2026-08-11

Stage 7 MVP validation should use the HTTP building query service, not direct app-runtime filesystem access.

Terminal 1:

```text
npm run data:buildings:minneapolis -- --output /tmp/comfortos-overture-minneapolis-store
```

Terminal 2:

```text
BUILDING_LOCAL_OVERTURE_STORE_DIR=/tmp/comfortos-overture-minneapolis-store BUILDING_QUERY_SERVICE_PORT=8787 npm run buildings:serve
```

Terminal 3:

```text
BUILDING_PROVIDER=http-overture BUILDING_QUERY_SERVICE_URL=http://127.0.0.1:8787 npm run dev
```

If `.env.local` defines `BUILDING_PROVIDER` or `BUILDING_LOCAL_OVERTURE_STORE_DIR`,
confirm Vinext is not overriding the intended HTTP provider. The Stage 7.5
browser check found a local sample-store setting in `.env.local`; that is useful
for fallback testing but should not be used for real-data latency validation.

Validation:

```text
BUILDING_PROVIDER=http-overture BUILDING_QUERY_SERVICE_URL=http://127.0.0.1:8787 npm run routes:validate:stage7 -- --max-candidate-attempts 4 --output /tmp/comfortos-stage-7-progressive-routes-http-attempts4.json
```

Stage 7.5 validation:

```text
BUILDING_PROVIDER=http-overture BUILDING_QUERY_SERVICE_URL=http://127.0.0.1:8787 npm run routes:validate:stage7.5 -- --max-candidate-attempts 4 --max-concurrent-candidate-requests 3 --output /tmp/comfortos-stage-7-5-final-c3-prepared-wind.json
```

If the building query service is not running, Comfort analysis should fail or become limited. It should not silently fall back to fixtures.

## Stage 8 Seattle Rain

Build the real Seattle Overture store:

```text
npm run data:buildings:seattle -- --output /tmp/comfortos-overture-seattle-store
```

Run the HTTP building service:

```text
BUILDING_LOCAL_OVERTURE_STORE_DIRS=/tmp/comfortos-overture-seattle-store BUILDING_QUERY_SERVICE_PORT=8787 npm run buildings:serve
```

Extract central-Seattle covered pedestrian features from OSM/Overpass:

```text
npm run data:covered-features:overpass -- --bbox -122.36,47.595,-122.315,47.625 --output /tmp/comfortos-seattle-covered-features.geojson
```

Run the app with explicit real-data providers:

```text
BUILDING_PROVIDER=http-overture BUILDING_QUERY_SERVICE_URL=http://127.0.0.1:8787 COVERED_FEATURE_PROVIDER=static-osm COVERED_FEATURE_STATIC_GEOJSON=/tmp/comfortos-seattle-covered-features.geojson COVERED_FEATURE_REGION=seattle-central-covered-feature-audit npm run dev
```

Run bounded Stage 8 validation:

```text
npm run routes:validate:stage8 -- --local-store /tmp/comfortos-overture-seattle-store --covered-features /tmp/comfortos-seattle-covered-features.geojson --limit 4 --route-timeout-ms 12000 --output /tmp/comfortos-stage-8-seattle-rain-validation-limit4-timeout.json
```
