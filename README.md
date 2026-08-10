# ComfortOS Stage 5

Stage 5 adds bounded candidate generation on top of the Stage 4.5 raw Comfort Cost reranker. It preserves OSRM walking alternatives as the baseline generator, adds deterministic corridor waypoint candidates for spatial diversity, prefilters candidates before environmental analysis, and reuses request-level weather and building context across accepted candidates. It is still candidate reranking only: no custom A*, no Stay Warm/Dry/Cool route behavior, no Climate DNA route naming, no tree canopy, and no rain/snow/AQI engines.

Stage 5.5 adds a local Overture-oriented building ingestion proof of concept, provider configuration, bounded building-provider caching, and repeatable Minneapolis validation fixtures. Public Overpass remains available, but it is no longer the only code path for engine validation.

## What Works

- Interactive MapLibre map centered on Minneapolis as the fallback location.
- Browser current-location support for origin selection.
- Real address/place search with debounced suggestions.
- Search result selection for either origin or destination.
- Tap-to-select origin/destination remains available.
- Reverse geocoding improves labels for map taps and current location.
- Fastest walking route request through the existing routing abstraction.
- OSRM alternative walking route candidates normalized behind the routing provider boundary.
- `CandidateGenerator` abstraction with OSRM-only baseline mode and enhanced composite generation.
- Corridor waypoint generation that offsets candidate waypoints in local meter geometry, then asks the routing provider to route through those waypoints.
- Pre-analysis rejection for duplicate, excessive-detour, and low-diversity candidates.
- Bounded environmental analysis so only the strongest 5 candidates are analyzed by default.
- Shared request-level weather and union-route building context reused across candidate shade, wind, and comfort analysis.
- Local Overture-oriented building store POC with bbox tile index and normalized `BuildingProvider`.
- Configurable building provider modes: `overpass`, `local-overture`, and `local-overture-with-overpass-fallback`.
- Bounded building-provider cache with hit/miss stats and failed-request eviction.
- Repeatable 18-route Minneapolis validation fixture and route/provider benchmark scripts.
- Candidate route deduplication with a deterministic route-overlap metric.
- Candidate diversity metrics: overlap with fastest, unique meters, and maximum lateral separation.
- Raw-cost Comfort reranking with explicit detour and meaningful-improvement policy.
- Fastest and Comfort route identities remain independently available and may legitimately be the same route.
- Route polyline, markers, walking distance, walking duration, origin name, and destination name.
- Real National Weather Service current conditions, hourly forecast points, and active alerts for the selected origin, current location, or fallback location.
- Compact live-weather summary with graceful failure text when official conditions are unavailable.
- Real building geometries loaded through a normalized `BuildingProvider`.
- Deterministic solar azimuth/elevation from coordinate and timestamp.
- Approximate building shadow polygons generated in a local meter projection.
- Route segmentation with deterministic estimated entry, midpoint, and exit times per segment.
- Per-segment solar evaluation using the segment midpoint timestamp.
- Exact line/shadow intersection length with overlap unioning, replacing the Stage 2 5 m sampling path for production shade.
- Distance-weighted estimated building-shade summary with explicit shaded, exposed, analyzed, unknown, and confidence metrics.
- Normalized wind exposure analysis using WeatherProvider wind data, route segment bearing, nearby building geometry, and a conservative shelter/channeling heuristic.
- Headwind, crosswind, tailwind, shelter, openness, estimated exposure, unknown-height influence, classification, and confidence metrics per route segment.
- Distance-weighted route-level wind summary with sheltered, neutral, exposed, and unknown meters accounted separately.
- Deterministic cold-profile Comfort analysis for the selected fastest route, with thermal, wind, and conservative winter sun/shade components.
- Raw Comfort Cost kept separate from the consumer Outdoor Comfort score.
- Debug shade map layer and validation details available with `?debug=shade`.
- Debug wind map layer and validation details available with `?debug=wind`.
- Debug comfort map layer and validation details available with `?debug=comfort`.
- Debug candidate reranking details available with `?debug=routing`.
- Combined environmental debug mode available with `?debug=environment`.

## Providers

Map renderer:

```text
MapLibre GL JS
```

Map tiles:

```text
OpenStreetMap raster tiles
```

Routing provider:

```text
FOSSGIS OSRM foot service
https://routing.openstreetmap.de/routed-foot
```

Geocoding provider:

```text
Photon public demo service
https://photon.komoot.io
```

Weather provider:

```text
National Weather Service API
https://api.weather.gov
```

Stage 2 live building provider:

```text
OpenStreetMap via Overpass API
https://overpass-api.de/api/interpreter
```

Production-scale building source target:

```text
Overture Maps Buildings
https://docs.overturemaps.org/guides/buildings/
```

Provider decisions:

```text
docs/decisions/ADR-001-stage-0-map-and-routing-providers.md
docs/decisions/ADR-002-geocoding-provider.md
docs/decisions/ADR-003-weather-provider.md
docs/decisions/ADR-004-building-data-provider.md
docs/decisions/ADR-005-shadow-geometry-engine.md
docs/decisions/ADR-006-urban-wind-model.md
docs/decisions/ADR-007-comfort-engine-v1.md
docs/decisions/ADR-008-comfort-route-reranking-v1.md
docs/decisions/ADR-009-candidate-generation-v1.md
docs/decisions/ADR-010-building-ingestion-and-provider-strategy.md
docs/analysis/STAGE_2_5_BUILDING_DATA_BENCHMARK.md
docs/analysis/STAGE_3_WIND_ENGINE_AUDIT.md
docs/analysis/STAGE_4_5_COMFORT_ROUTE_RERANKING_VALIDATION.md
docs/analysis/STAGE_5_5_BUILDING_PROVIDER_BENCHMARK.md
docs/analysis/STAGE_5_CANDIDATE_GENERATION_VALIDATION.md
docs/analysis/STAGE_5_ROUTING_ENGINE_EVALUATION.md
```

The NWS provider is an official public U.S. weather source. Photon, FOSSGIS, and direct Overpass access remain development choices, not production dependencies.

## Environment

Copy `.env.example` if you want to override defaults:

```bash
cp .env.example .env.local
```

Supported variables:

```text
ROUTING_BASE_URL=https://routing.openstreetmap.de/routed-foot
NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE=https://tile.openstreetmap.org/{z}/{x}/{y}.png
GEOCODING_BASE_URL=https://photon.komoot.io
GEOCODING_COUNTRY_CODE=US
WEATHER_BASE_URL=https://api.weather.gov
WEATHER_USER_AGENT=ComfortOS Stage 1 (contact: replace-with-project-contact)
BUILDING_OVERPASS_BASE_URL=https://overpass-api.de/api/interpreter
BUILDING_PROVIDER=overpass
# BUILDING_PROVIDER=local-overture
# BUILDING_LOCAL_OVERTURE_STORE_DIR=/absolute/path/to/local/overture/store
```

No secrets are required for Stage 2. Replace the weather User-Agent contact placeholder before shared or production use.

## Commands

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev -- --hostname 127.0.0.1
```

Then open:

```text
http://127.0.0.1:3000/
```

Validate:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

Building ingestion and validation:

```bash
npm run buildings:ingest:overture -- --input fixtures/buildings/minneapolis-overture-sample.geojson --output /tmp/comfortos-overture-sample-store --region minneapolis-sample --bounds -93.33,44.93,-93.20,45.02
npm run buildings:benchmark -- --local-store /tmp/comfortos-overture-sample-store
npm run routes:validate:comfort:local -- --local-store /tmp/comfortos-overture-sample-store
```

## Architecture

Key boundaries:

```text
components/                 UI and map rendering
lib/geo/                    coordinate, geometry, formatting, validation
lib/geolocation/            browser geolocation state helpers
lib/geocoding/types.ts      PlaceResult, GeocodingProvider
lib/geocoding/providers/    provider adapters
lib/search/                 search request behavior helpers
lib/routing/types.ts        RouteRequest, RouteResult, RoutingProvider
lib/routing/providers/      routing provider adapters
lib/routing/generators/     route candidate generators
lib/routing/service.ts      routing application service
lib/comfort-routing/        candidate comparison policy, selector, and service
lib/weather/types.ts        WeatherSnapshot, forecast, alert, and provider contracts
lib/weather/providers/      weather provider adapters
lib/weather/service.ts      cached weather application service
lib/environment/buildings/  building models, bounds helpers, provider adapters
lib/environment/solar/      deterministic solar-position engine
lib/environment/shade/      shadows, route segments, shade analysis service
lib/environment/wind/       wind vectors, urban shelter heuristic, wind service
lib/comfort/                Comfort Cost, cold profile, wind-chill, score mapping, service
app/api/geocoding/          server geocoding API routes
app/api/routes/walking/     server routing API route
app/api/routes/comfort-comparison/ server route-comparison API route
app/api/weather/            server weather API route
app/api/environment/shade/  server shade-analysis API route
app/api/environment/wind/   server wind-analysis API route
app/api/environment/comfort/server comfort-analysis API route
```

React components call app-facing client helpers and consume normalized models. Photon, OSRM, NWS, and Overpass response shapes stay inside provider adapters.

Weather location priority is selected origin, browser current location, then the Minneapolis fallback. The weather service uses a coordinate key rounded to three decimals and a five-minute in-memory TTL, plus server cache headers, to avoid repeated identical provider requests during normal renders.

Shade analysis uses the selected route geometry, departure timestamp, and route duration. Routes are segmented into roughly 30-meter segments. Each segment receives deterministic estimated entry, midpoint, and exit timestamps using distance-weighted traversal time. Building shadows are calculated at each segment midpoint timestamp, then segment shade is calculated by exact line/polygon clipping. Overlapping shadow polygons are unioned along the segment so shaded distance is not double-counted.

Building queries use a padded route bounding box and a 24-hour in-memory cache. Building heights use explicit provider height first, then `building:levels * 3 m`, then unknown. Unknown-height buildings do not cast shadows. They reduce route confidence only where their buffered footprint influence areas intersect the route, rather than making the whole route unknown.

Shade quality is reported as:

```text
geometryCoverage
heightCoverage
explicitHeightCoverage
derivedHeightCoverage
routeAnalysisCoverage
overallConfidence
```

The normal UI stays compact. `?debug=shade` exposes departure time, segment midpoint time, solar azimuth/elevation, exact shaded length, exposed length, unknown meters, height provenance counts, and map debug layers.

Wind analysis consumes normalized `WeatherBundle` data, not NWS response shapes. NWS wind direction is treated as meteorological direction, meaning the direction wind comes from. A north wind moves north to south; a northbound pedestrian receives a headwind. Segment wind uses the segment midpoint timestamp and the nearest/interpolated hourly forecast wind where available. Current observation wind is used only when forecast wind is unavailable.

The Stage 3 urban wind model is a deterministic heuristic, not CFD. It searches nearby upwind buildings, weights estimated shelter by height, width, distance, lateral alignment, and height provenance, and applies a small capped channeling modifier when a simple two-sided street-canyon condition is aligned with wind motion. Unknown-height nearby buildings lower confidence and contribute partial unknown route meters by proximity, but do not create strong shelter claims. Lack of nearby buildings is a valid open-exposure result, not unknown.

Wind route summaries account for every route meter as sheltered, neutral, exposed, or unknown. Overall confidence combines weather confidence, route geometry coverage, building height coverage, shelter-model confidence, and route-analysis coverage without double-counting local height uncertainty.

Comfort analysis consumes normalized `WeatherBundle`, `ShadeAnalysisResult`, and `WindAnalysisResult` objects. It does not call NWS, Overpass, OSRM, or MapLibre. The Stage 4 cold profile computes decomposable per-segment thermal, wind, and solar components, aggregates them by estimated traversal time, and reports route-level raw Comfort Cost, Outdoor Comfort score, confidence, completeness, and dominant factors. Wind chill uses the recognized Celsius wind-chill equation only when temperature is at or below 10 C and estimated pedestrian wind exposure is above 4.8 km/h. Daytime winter sun is a conservative benefit proxy derived from building shade, not a solar radiation claim.

Comfort completeness is separate from confidence. Missing wind or shade does not become zero-cost ideal weather. When required environmental dimensions are missing, the UI shows `Limited data` and the API returns partial raw component analysis with `comfortScore: null`. Future route optimization must use raw `RouteComfortCost` fields, not rounded 0-100 display scores.

Route comparison uses a `CandidateGenerator` boundary. OSRM alternatives remain the baseline candidate input. Enhanced mode combines OSRM alternatives with corridor waypoint candidates, deduplicates routes, rejects excessive detours and candidates with too little unique geometry, then analyzes only the bounded candidate set. Every accepted candidate runs through the audited shade, wind, and comfort pipeline using shared weather and building inputs for the request. Only comparable candidates can win Comfort reranking. Selection uses `routeComfortCost.environmentalExposureCost`, bounded by an explicit detour policy and an 8% minimum raw-cost improvement threshold. Rounded `comfortScore` remains presentation-only.

Building providers are selected by configuration and remain behind the normalized `BuildingProvider` interface. The Stage 5.5 local Overture POC is a Node-side JSONL + tile-index store for repeatable engine validation. The current Vinext/Cloudflare worker-like app runtime cannot use the Node `fs` local provider directly; a production-compatible store should expose the indexed Overture extract through a worker-compatible service or storage layer.

## Known Limitations

- Public Photon and FOSSGIS services are suitable for development only.
- Business/place search quality depends on OpenStreetMap coverage.
- No persistent route history.
- No custom Comfort graph routing or edge-level environmental routing.
- OSRM may return no alternatives, very similar alternatives, or alternatives that are not more comfortable.
- Corridor waypoint candidates depend on whether the routing provider can produce a useful pedestrian route through the generated waypoint.
- Live candidate analysis can be slow, but Stage 5 bounds expensive environmental analysis and reuses weather/building context across candidates.
- The Outdoor Comfort score is a presentation mapping for the one selected route, not a routing weight and not a scientific physiological measurement.
- Partial comfort analyses are not directly comparable route scores; missing required dimensions show limited data rather than a numeric score.
- Current location depends on browser permission and device support.
- NWS coverage is U.S.-only; unsupported coordinates show “Live conditions unavailable” while routing remains usable.
- Direct Overpass access is suitable for Stage 2 validation only; production should use an Overture-backed ingestion/query service or another building provider behind the same interface.
- The Stage 5.5 local Overture store validates ingestion/provider architecture, but the checked-in sample fixture is not a real Minneapolis-wide Overture extract.
- The current app runtime cannot directly use the Node `fs` local provider; direct Node validation can.
- The Stage 2.5 benchmark recommends height enrichment before production-quality shade because the Minneapolis validation corridor had no explicit building heights.
- Building shade is not total shade. It excludes trees, awnings, covered walkways, cloud cover, UV intensity, and material heat effects.
- Shadow geometry is approximate and intended for deterministic engine validation, not final survey-grade analysis.
- Wind exposure is not measured street wind. It excludes CFD, vegetation, terrain, vehicle wakes, thermal effects, and sensor calibration.
- Street-canyon channeling is intentionally conservative and capped; it prepares the architecture for future calibrated models without claiming precision.
