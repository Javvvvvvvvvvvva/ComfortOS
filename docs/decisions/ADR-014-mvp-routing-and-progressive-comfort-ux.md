# ADR-014 — MVP Routing And Progressive Comfort UX

Date: 2026-08-11
Status: Accepted

## Context

Stage 6 validated edge-level environmental routing as research and accepted `KEEP STAGE 5 FOR MVP`. Stage 7 turns the existing real engines into a usable Minneapolis MVP experience without migrating production routing to the Stage 6 research router.

The prior UI waited for full Comfort comparison before showing a walking route. Stage 5.7 measured average Comfort latency near 8.90 seconds, which is too slow for the first useful consumer response.

## Decision

Retain the MVP production routing architecture:

```text
OSRM walking route
↓
Stage 5 candidate generation
↓
shared weather and building context
↓
shade + wind + comfort analysis
↓
raw-cost reranking
```

Consumer requests now use a progressive flow:

```text
origin + destination
↓
Fastest walking route renders first
↓
Comfort analysis runs in the background
↓
Comfort / Limited / Failed state updates the UI
```

Stage 6 code remains isolated under `lib/routing-research/` and production runtime code is tested so it does not import that namespace.

## Route Naming

Stage 7 uses two presentation labels:

- `Fastest`
- `Comfort` in balanced or mild live weather
- `Stay Warm` only when deterministic live-weather thresholds activate cold context

The app does not show `Fastest`, `Comfort`, and `Stay Warm` as three redundant cards when Comfort and Stay Warm represent the same current objective.

Cold mode is activated from weather values, not city names:

- cold ambient temperature
- cold apparent temperature
- cool and windy conditions

Heat and rain mappings remain future work.

## Explanations

Consumer route explanations are deterministic and generated from analyzed route metrics. They use cautious wording such as estimated wind exposure, less headwind, more winter sun, and estimated building shade.

Trivial differences are suppressed by centralized presentation thresholds. These explanation thresholds do not change the route-selection thresholds.

## Latency Strategy

Fastest route latency is treated as the perceived first response. Comfort latency is still measured and improved, but it no longer blocks the basic route.

Stage 7 changes the MVP candidate-attempt cap from 6 tested attempts to a 4-attempt product request. In validation, 4 attempts preserved complete comparable environmental analysis while reducing average Comfort completion from 7.56 seconds to 6.00 seconds.

The main remaining bottleneck is OSRM candidate routing, followed by wind analysis on dense building sets. Building query latency is no longer the limiting factor.

## Fallback Behavior

- walking route unavailable: show an error and keep the app usable
- live weather unavailable: standard walking route remains available
- environmental analysis unavailable: Fastest route remains selected
- limited environmental data: do not claim Comfort superiority
- NWS alerts remain visually separate and higher-priority than ordinary comfort messaging

## Consequences

- The MVP feels responsive because a route appears as soon as OSRM returns Fastest.
- Comfort analysis can be slow or limited without blocking walking navigation.
- Warm live weather does not display `Stay Warm` just because Minneapolis is the validation city.
- The app has a basic navigation preview with no fake GPS-progress claim.

## Revisit Conditions

Revisit production custom routing only when ComfortOS has:

- a production pedestrian graph source or a validated Valhalla/GraphHopper path
- cached edge environmental costs
- materially stronger comfort-route improvements than Stage 5
- low-single-digit-second or better Comfort completion in production-like conditions
- calibrated contextual objectives beyond the cold profile
