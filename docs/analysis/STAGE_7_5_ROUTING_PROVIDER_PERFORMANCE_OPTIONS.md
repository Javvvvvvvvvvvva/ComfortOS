# Stage 7.5 Routing Provider Performance Options

Date: 2026-08-12

## Current Public OSRM

Current MVP routing uses the public FOSSGIS OSRM foot endpoint through `OsrmWalkingProvider`.

Strengths:

- already compatible with `RoutingService` and `CandidateGenerator`
- returns normalized route geometry, distance, and duration
- no new operations burden
- adequate Fastest latency in warm runs

Risks:

- public-service latency is variable
- bounded concurrency can improve or worsen latency depending on provider queueing
- no ComfortOS control over capacity, throttling, or routing graph updates
- no environmental edge-cost hooks

Stage 7.5 result: public OSRM remains acceptable for the MVP when Fastest is progressive and candidate concurrency is bounded. It is still the next operational blocker if ComfortOS needs predictable p95 below low single digits.

## Self-Hosted OSRM

Strengths:

- direct control over concurrency, capacity, region extracts, and caching
- current provider can remain mostly unchanged by swapping `ROUTING_OSRM_BASE_URL`
- likely best path for reducing candidate-generation p95 without changing product semantics

Risks:

- requires pedestrian profile build, graph extract/update pipeline, hosting, monitoring, and capacity planning
- route quality remains OSRM/profile-dependent
- does not solve environmental edge weighting by itself

Fit: strong near-term performance option because it preserves the existing provider boundary.

## Hosted Commercial Or Managed Routing Provider

Strengths:

- better SLA, quotas, and observability than public OSRM
- may provide optimized walking routes and batch/alternative APIs
- lower operations burden than self-hosting

Risks:

- cost and quota exposure scale with candidate generation
- provider-specific alternatives and waypoint behavior must stay normalized
- data/license constraints may affect product claims

Fit: viable MVP deployment option if cost and walking quality are acceptable.

## Valhalla

Strengths:

- supports richer costing concepts than OSRM
- can be self-hosted
- better architectural bridge toward future environmental costing than current OSRM alternatives

Risks:

- migration requires a new provider implementation and validation suite
- environmental cost integration is still future work
- operations burden is similar to self-hosted routing

Fit: best future candidate if ComfortOS needs more than route-level reranking. Stage 7.5 does not migrate to Valhalla.

## Recommendation

Keep public OSRM for the MVP while the progressive UX masks slow background analysis. For production deployment, evaluate self-hosted OSRM first because it is the lowest-risk compatibility upgrade for candidate-generation latency. Evaluate Valhalla before any ComfortOS-owned graph router if product needs environmental edge-cost routing.
