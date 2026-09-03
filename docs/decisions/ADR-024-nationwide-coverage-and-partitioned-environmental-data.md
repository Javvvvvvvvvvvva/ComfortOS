# ADR-024 - Nationwide Coverage and Partitioned Environmental Data

Date: 2026-09-03
Status: Accepted

## Context

ComfortOS needs to grow beyond the Minneapolis, Seattle, and Phoenix validation metros.
Managed place search, walking directions, and National Weather Service weather already have
a nationwide provider scope, but detailed Comfort analysis depends on large local building
and covered-feature datasets. Treating a state as one dataset would create oversized files,
slow startup, expensive updates, and false statewide coverage claims.

## Decision

ComfortOS registers all 50 states and the District of Columbia in one versioned catalog
derived from the United States Census Bureau state cartographic boundary file.

Capability is reported separately for nationwide provider eligibility, deployed
environmental data, and reviewed validation regions. A jurisdiction in the catalog is not a
claim that detailed Comfort data is deployed statewide.

Environmental building data is planned as bounded grid partitions that intersect the exact
official state geometry. Each partition uses the existing immutable Overture store format.
The planner is geography-driven and does not add state-specific calculation code.

The private environment query service reads partition manifests in bounded batches. It
loads building and tile-index files only for partitions intersecting a request, keeps a
bounded least-recently-used set in memory, and releases inactive stores. State build jobs
require an explicit positive partition limit and support dry-run and resume modes.

## Consequences

- Search, routing, and weather can operate nationwide without pretending environmental data
  is present.
- New states use the same provider and engine contracts as validation metros.
- Large datasets can be built, reviewed, deployed, and rolled back in small batches.
- Startup and memory usage no longer scale with the total size of every configured store.
- Nationwide detailed Comfort coverage still requires data ingestion, quality gates,
  durable storage, operational cost review, and regional validation.

## Alternatives Considered

### One Overture Store Per State

Rejected because large states and dense metros would create uneven files and excessive
memory use while making partial rollout difficult.

### Mark Every State Fully Supported Immediately

Rejected because route and weather eligibility does not prove local shade or cover quality.
Missing data must remain visible and must not generate favorable Comfort results.

### Add One Adapter Per State

Rejected because state names are deployment geography, not environmental-engine behavior.
Core algorithms remain city- and state-agnostic.
