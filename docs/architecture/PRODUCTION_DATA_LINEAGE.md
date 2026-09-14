# ComfortOS Production Data Lineage

Date: 2026-08-10
Updated: 2026-09-13 (Snow Comfort v1 and normalized NWS snow/ice grids)

## Production Invariant

Production user-visible environmental claims must originate from either real provider data or deterministic calculations derived from real provider inputs. Design fixtures, test fixtures, development fixtures, demo city constants, and hardcoded scenario values are not valid sources for production environmental claims.

Production runtime directories are:

```text
app/
components/
lib/
```

These directories are prohibited from importing:

```text
fixtures/
tests/
docs/design/baseline/
```

This is enforced by ESLint and by `tests/production-data-boundary.test.ts`.

## Source Inventory

| Domain | Classification | Source | Provider / Engine | User-visible surface |
| --- | --- | --- | --- | --- |
| Basemap | PRODUCTION REAL DATA | OpenStreetMap raster tiles | MapLibre style source | Map background |
| Routing | PRODUCTION REAL DATA for the accepted MVP provider; DEVELOPMENT ONLY when public demo | Mapbox Directions API v5 `mapbox/walking`; explicitly configured OSRM-compatible service remains a migration option | `createConfiguredRoutingProvider` -> `MapboxWalkingRoutingProvider` -> `RoutingService` | ETA, distance, route geometry, routing readiness |
| Route candidates | DETERMINISTIC COMPUTATION from real routing | Provider alternatives plus corridor waypoint walking-route requests | `CompositeCandidateGenerator` | Fastest / Comfort route cards |
| Geocoding | PRODUCTION REAL DATA when managed; DEVELOPMENT ONLY when public demo | Mapbox Search Box API v1 for managed POI/address search; Photon remains an explicit development or self-hosted option | `createConfiguredGeocodingProvider` -> `MapboxSearchBoxProvider` or `PhotonGeocodingProvider` | Search suggestions, selected-place coordinates, and reverse-geocoded labels |
| Weather current conditions | PRODUCTION REAL DATA | National Weather Service nearest-station observation | `NwsWeatherProvider` -> `WeatherService` (`nws-si-v3.0.0`) | Ambient temperature, distinct Heat Index/Wind Chill, humidity, dew point, cloud layers, wind, precipitation, observation age/distance |
| Weather forecast | PRODUCTION REAL DATA | National Weather Service hourly and digital grid forecast | `NwsWeatherProvider` -> `WeatherService` (`nws-si-v3.0.0`) | Time-bounded temperature, humidity, dew point, sky cover, wind, liquid-equivalent precipitation, snowfall accumulation rate, ice accumulation rate, and precipitation type |
| Weather alerts | PRODUCTION REAL DATA | National Weather Service alerts | `NwsWeatherProvider` -> `WeatherService` | Alert headline |
| Controlled weather scenarios | RESEARCH FIXTURE | Fixed Stage 6 winter, Stage 8 rain, and Stage 9 heat scenario definitions | `lib/routing-research/environment/` | Research validation only; never production claims |
| Building footprints | PRODUCTION REAL DATA when Overpass or real Overture store/service is selected; DEVELOPMENT FIXTURE only in explicit fixture scripts/tests | Overpass or real Overture local/query-service stores | `BuildingProvider` implementations | Shade/wind/heat/comfort inputs and debug building counts |
| Building heights | PRODUCTION REAL DATA or normalized provider attributes; DETERMINISTIC COMPUTATION for floor-derived heights | Provider `height`, `min_height`, `num_floors` / `building:levels` | `normalizeBuildingHeight` | Height coverage, shade/wind confidence |
| Terrain elevation | RESEARCH PILOT; not active in route ranking | USGS 3DEP Bare Earth DEM, pinned to service data through 2026-08-24 | `lib/environment/terrain/usgs3dep.ts` and bounded pilot builder | Internal elevation, grade, slope, source resolution, completeness, and checksum evidence only |
| Land cover / impervious surface | INGESTION CANDIDATE; not active in route ranking | USGS Annual NLCD Collection 1.2, 2025 | Future normalized environment-cell provider | No current user-visible claim |
| Tree canopy | INGESTION CANDIDATE; not active in route ranking | USDA Forest Service TCC 2025.6 | Future normalized environment-cell provider | No current user-visible claim; 30 m canopy must not be labeled as individual trees or measured shade |
| Landforms / pedestrian surface | FALLBACK OR INGESTION CANDIDATE; not active in route ranking | Overture Base and Transportation 2026-08-19.0 | Future normalized vector/environment provider | No current user-visible claim; optional attributes remain incomplete |
| Solar position | DETERMINISTIC COMPUTATION | Timestamp and route coordinate | `SolarPositionEngine` / SunCalc | Shade debug azimuth/elevation |
| Shade | DETERMINISTIC COMPUTATION from real route/building/time | Route geometry, building footprints/heights, solar position | `ShadeAnalysisService` | Estimated shade %, analyzed meters, confidence |
| Wind | DETERMINISTIC COMPUTATION from real weather/buildings/route | NWS wind, route geometry, buildings | `WindAnalysisService` / `HeuristicUrbanWindModel` | Estimated wind exposure, confidence |
| Covered walking features | PRODUCTION REAL DATA when explicitly selected; unavailable otherwise | OpenStreetMap/Overpass covered pedestrian tags or future normalized source, semantically filtered for pedestrian cover and access | `CoveredFeatureProvider` | Rain Engine inputs, debug source/feature counts, eligible feature counts, cover quality |
| Rain | DETERMINISTIC COMPUTATION from real weather/covered-features/route | NWS precipitation intensity/probability, route geometry, regional wind, covered features | `RainAnalysisService` | Estimated rain exposure, covered/exposed meters, confidence |
| Snow / ice | DETERMINISTIC COMPUTATION from real weather/covered-features/wind/route | NWS snowfall and ice accumulation grids, route timing, estimated pedestrian wind, covered features | `SnowAnalysisService` (`snow-v1.0.0`) | Estimated winter exposure, snowfall/ice rates, covered/exposed meters, confidence; never plowing, pavement safety, or accessibility |
| Heat | DETERMINISTIC COMPUTATION from normalized weather/shade/wind/route timing | Ambient temperature plus one NWS Heat Index humidity pathway, route geometry, estimated building shade, solar elevation, numeric cloud attenuation, bounded wind ventilation | `HeatAnalysisService` (`heat-v2.0.0`) | Estimated heat exposure, explicit humidity contribution, direct-sun ratio, longest sunny stretch, confidence |
| Comfort Cost | DETERMINISTIC COMPUTATION from normalized weather/shade/wind/rain/snow/heat/route | Environmental analyses | `ComfortAnalysisService` (`comfort-v3.0.0`) | Raw comfort cost, debug factors, model version |
| Comfort Score | DETERMINISTIC COMPUTATION from Comfort Cost | Monotonic score mapping | `ComfortEngine` | Display score only |
| Route comparison | DETERMINISTIC COMPUTATION from candidate costs | Candidate analyses and reranking policy | `selectComfortRouteComparison` | Recommended Comfort candidate |
| UI explanation percentages | DETERMINISTIC COMPUTATION | Candidate metrics | Route comparison response | Environmental exposure reduction % |
| Map environment overlays | DETERMINISTIC COMPUTATION | Debug GeoJSON from shade/wind/comfort engines | `ComfortMap` | Debug overlays only |
| Future departure values | DETERMINISTIC COMPUTATION / PRODUCTION REAL DATA when request supplies departure time and forecast | Request time and forecast | Route segment timing, weather forecast selection | Debug timestamps |
| City labels | FALLBACK / PLACEHOLDER | Minneapolis prototype shell label and map center | UI shell / `MINNEAPOLIS_CENTER` | Prototype context label only |
| Active navigation guidance | FALLBACK / PLACEHOLDER | Not implemented in production runtime | None | No active navigation claim in runtime |

## Data Flow

### Routing

```text
Configured managed, self-hosted, or development walking service
↓
MapboxWalkingRoutingProvider or OsrmWalkingProvider
↓
RouteResult / RouteCandidateSet
↓
RoutingService / CandidateGenerator
↓
/api/routes/walking or /api/routes/comfort-comparison
↓
ComfortOSApp route cards and ComfortMap route geometry
```

### Weather

```text
National Weather Service
↓
NwsWeatherProvider
↓
WeatherBundle
↓
WeatherService
↓
/api/weather and ComfortRouteComparisonService
↓
EnvironmentSummary, WindAnalysisService, RainAnalysisService, SnowAnalysisService, HeatAnalysisService, ComfortAnalysisService
```

### Buildings

```text
Overpass or real Overture-derived query service/local store
↓
BuildingProvider
↓
Building[]
↓
ShadeAnalysisService, WindAnalysisService, and HeatAnalysisService
↓
ComfortRouteComparisonService
↓
Debug building counts, shade/wind/comfort outputs
```

`BuildingProvider` is the permanent consumer boundary. Overture-native, Overpass-native, filesystem, database, or query-service schemas must not leak into shade, wind, comfort, routing, or React components.

### Terrain, Land, And Canopy Candidates

```text
USGS 3DEP / Annual NLCD / Forest Service TCC / Overture
↓
versioned source catalog and source-specific ingestion adapters
↓
checksummed normalized spatial partitions
↓
future EnvironmentLayerProvider boundary
↓
shadow experiments and route-ordering validation
```

The checked-in source catalog is
`config/data-sources/environment-layers-v1.json`. The first 3DEP adapter is a bounded
research pilot and writes only to an explicit output directory. Its artifacts are marked
`productionEligible: false`. None of these layers currently enter `RouteComfortCost`.

Source resolution is evidence, not a promise about route precision. A 30-meter canopy cell
supports corridor-level canopy context; it does not establish an individual tree, exact
sidewalk shade, rain cover, or current path condition. Missing raster cells remain missing
and lower completeness instead of becoming a zero-cost environmental value.

### Rain And Covered Features

```text
National Weather Service precipitation
↓
WeatherProvider / WeatherBundle
↓
RainAnalysisService
```

```text
OpenStreetMap covered pedestrian tags or future cover source
↓
semantic/access normalization
↓
CoveredFeatureProvider
↓
CoveredFeature[]
↓
RainAnalysisService
```

`precipitationProbability` is not treated as precipitation intensity. When `precipitationMmPerHour` is unavailable, rain analysis reports reduced confidence/completeness rather than assuming dry conditions.

Covered features carry explicit `kind`, `confidence`, `access`, `accessConfidence`, and provenance evidence. Ordinary building footprints, building proximity, and tree canopy are not rain-cover evidence. Unknown access lowers confidence; restricted access is not rain-cover eligible. `Stay Dry` consumer eligibility depends on route-accessible covered meters and continuous covered runs, not merely successful analysis or feature count.

### Heat

```text
National Weather Service temperature / apparent temperature / relative humidity
↓
WeatherProvider / WeatherBundle
↓
HeatAnalysisService
```

```text
Route timing + estimated building shade + solar elevation + bounded wind ventilation
↓
HeatAnalysisService
↓
ComfortAnalysisService profile=heat
```

Heat analysis does not call NWS directly and does not import provider-specific weather responses. It consumes normalized `WeatherBundle`, shade analysis, wind analysis, and route timing. Direct-sun exposure is represented as an estimated proxy from daylight solar elevation and `1 - buildingShadeRatio`; ComfortOS must not claim measured solar radiation or tree-canopy shade in Stage 9. Night routes keep ambient heat cost but direct solar cost is zero.

NWS heat index / apparent-temperature semantics are treated conservatively. Heat Index is only used in its warm valid range, and consumer wording remains “estimated heat exposure” / “estimated building shade,” not medical heat risk, WBGT, or safety.

### Snow And Ice

NWS digital-grid accumulation amounts are normalized to rates using each value's actual
`validTime` duration. A four-hour snowfall amount is divided by four; it is not treated as an
hourly amount and the implementation does not assume every grid interval is six hours.

```text
snowfallFactor = clamp(snowfallMmPerHour / 12.5)
iceFactor = clamp(iceAccumulationMmPerHour / 0.25)
windFactor = 1 + 0.5 * clamp(estimatedPedestrianWindMps / 10)
snowfallExposure = snowfallFactor * conservativeUncoveredRatio * windFactor
iceExposure = iceFactor
```

Known route-accessible overhead cover reduces falling-snow exposure. It does not erase ice
accumulation exposure, because v1 has no observed sidewalk surface state. Unknown cover is
treated conservatively as exposed while lowering confidence and completeness. Frozen
precipitation is excluded from the liquid-rain calculation to prevent double counting.

`Snow Comfort` compares relative outdoor exposure only. It does not identify plowed routes,
observed black ice, accessible pavement, safe slopes, or safe travel. Terrain elevation exists
only as a research pilot and is not an active Snow Comfort input.

Nationwide validation uses one existing Stage 10 urban route fixture per state and the District
of Columbia. The 2026-09-13 pass covered 51/51 representative points for the first 24 forecast
hours and 51/51 end-to-end managed route comparisons. This is representative integration
evidence, not a claim that every road, address, or local forecast office has been exhaustively
sampled.

### Comfort Route Comparison

```text
Fastest normalized walking route
↓
rendered immediately in ComfortOSApp
↓
provider and corridor-waypoint candidates
↓
shared WeatherBundle + shared Building[] + shared CoveredFeature[]
↓
ShadeAnalysisService + WindAnalysisService + RainAnalysisService + SnowAnalysisService + HeatAnalysisService
↓
context decision + ComfortAnalysisService
↓
RouteComfortCost
↓
selectComfortRouteComparison
↓
ComfortOSApp route options
```

Raw `environmentalExposureCost` selects the Comfort candidate only when the candidate is comparable, detour-eligible, and meaningfully improved. `comfortScore` remains display-only.

## Fixture Boundaries

Allowed fixture locations:

```text
docs/design/baseline/
fixtures/
tests/
```

Allowed fixture consumers:

```text
scripts/
tests/
docs/
```

Production runtime code must not import fixture paths. `BUILDING_PROVIDER=local-overture` also requires an explicit store path and will not silently fall back to the checked-in five-building sample.

Controlled environmental scenarios under `lib/routing-research/` are research fixtures. They are guarded from production use unless `COMFORTOS_ENABLE_RESEARCH_ROUTING=true` is explicitly set in a production process for a deliberate research run. Stage 9 heat scenarios use `source = research-scenario` and are not production weather.
