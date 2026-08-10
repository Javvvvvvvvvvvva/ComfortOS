# Stage 5 Candidate Generation Validation

Date: 2026-08-10

## Scope

This validation covers the Stage 5 implementation of enhanced route candidate generation. It validates architecture, deterministic geometry, filtering behavior, shared environmental context, stale UI request protection, and local code health. It does not validate a custom routing engine, edge-level comfort costs, or consumer route modes.

## Implementation Summary

Stage 5 adds:

- `CandidateGenerator` interface in `lib/routing/generators/types.ts`
- `OsrmAlternativeGenerator` baseline wrapper
- `CorridorWaypointGenerator` for deterministic spatially diverse waypoint attempts
- `CompositeCandidateGenerator` for enhanced mode and `osrm-only` baseline mode
- waypoint support in normalized `RouteRequest`
- generation provenance on `RouteCandidate`
- pre-analysis filtering in the comfort-route comparison service
- request-level reuse of weather and union-route building context
- route comparison debug generation metrics
- stale request protection in the route calculation UI flow

## Corridor Geometry

The corridor generator does not offset raw latitude or longitude degrees. It projects fastest-route sample points into a local meter coordinate system, computes a perpendicular normal from nearby route geometry, offsets by configured meter distances, then unprojects the waypoint back to geographic coordinates.

Default policy:

```text
corridorWidthMeters: 260
offsetDistancesMeters: [120, 220]
routeSampleRatios: [0.5, 0.33, 0.67]
maxCandidateAttempts: 8
maxEnvironmentAnalyzedCandidates: 5
minUniqueMeters: 40
maxPreAnalysisDurationRatio: 0.45
maxPreAnalysisDistanceRatio: 0.45
```

Each waypoint route is requested through the existing routing service as an ordered waypoint route. Failed waypoint routes are ignored rather than poisoning the whole comparison.

## Filtering

The comparison service keeps the fastest route available, then deduplicates and prefilters generated candidates before environmental analysis. Rejected candidates are reported in debug output with generator id and reason.

Filtering reasons:

- `excessive-detour`
- `low-diversity`

Route diversity debug metrics:

- `overlapWithFastest`
- `uniqueMeters`
- `maxLateralSeparationMeters`

## Shared Environmental Context

The service fetches one weather bundle per comparison request unless the caller supplies one. It computes a union bounding box over the bounded accepted candidate set, fetches buildings once, then passes those buildings into shade and wind analysis for every candidate.

This preserves provider separation while avoiding repeated Overpass building fetches for every candidate.

## Automated Validation

Command results:

```text
npm run typecheck
pass

npm test
96 tests passed
```

Stage 5-specific tests cover:

- corridor waypoint attempts use meter offsets
- waypoint routing normalizes accepted candidates and tolerates failed attempts
- composite generation can run OSRM-only baseline mode
- diversity metrics report unique meters and lateral separation
- comparison prefiltering bounds environmentally analyzed candidates
- comparison reuses one shared building fetch across shade and wind analysis
- comparison returns partial non-comparable candidates rather than 503 when the shared building fetch fails

Existing reranking tests still pass, including:

- incomplete candidates cannot win
- tiny raw-cost improvements do not force a separate Comfort route
- fastest and comfort may be the same candidate
- detour policy blocks lower-cost but excessive alternatives

## Product Contract

The Stage 4.5 reranker remains intact. Stage 5 changes how candidates enter the comparison; it does not change what makes a route eligible to win:

```text
RouteComfortCost.environmentalExposureCost
RouteComfortCost.averageEnvironmentalCost
RouteComfortCost.analyzedDurationMinutes
RouteComfortCost.confidence
RouteComfortCost.completeness
RouteComfortCost.comparable
```

Rounded Outdoor Comfort score remains display-only.

## Local API Smoke

Local dev server:

```text
http://127.0.0.1:3001/
```

Smoke route:

```text
origin:      44.9778, -93.2650
destination: 44.9737, -93.2277
```

OSRM-only mode:

```text
status: 200
generatedCandidates: 1
deduplicatedCandidates: 1
environmentAnalyzedCandidates: 1
selected: osrm-1 as fastest-and-comfort
comparable: false during this smoke because public building fetch was unavailable
```

Enhanced mode:

```text
status: 200
generatedCandidates: 7
deduplicatedCandidates: 7
environmentAnalyzedCandidates: 4
detourFilteredCandidates: 0
diversityFilteredCandidates: 0
selected: osrm-1 as fastest-and-comfort
```

Enhanced candidate diversity:

```text
osrm-1:     unique 0 m,    lateral 0 m,   overlap 1.00
corridor-6: unique 979 m,  lateral 126 m, overlap 0.72
corridor-2: unique 825 m,  lateral 95 m,  overlap 0.76
corridor-4: unique 1765 m, lateral 168 m, overlap 0.50
```

The enhanced smoke proves that corridor waypoint generation can produce spatially diverse pedestrian candidates through the existing routing provider. The public building provider was not reliable enough during this run to produce complete comparable raw environmental costs for a 15+ route sweep. Because provider reliability did not permit the larger sweep, Stage 5 treats the broad live benchmark as the next validation task after building data reliability improves or an Overture-backed provider is available.
