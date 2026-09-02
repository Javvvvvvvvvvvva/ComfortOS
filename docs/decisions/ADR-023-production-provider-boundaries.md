# ADR-023 - Production Provider Boundaries

Date: 2026-09-02
Status: Accepted

## Context

The Stage 10 readiness audit found that the browser still depended on community map tiles,
the worker had no production-safe way to query local Overture and covered-feature files,
and configuration-only health could not verify live dependencies. These were release
infrastructure gaps, not reasons to move environmental calculations into the UI or couple
core engines to provider response formats.

## Decision

ComfortOS adopts three production boundaries:

1. The browser requests managed Mapbox Static Tiles through a same-origin application route.
   The application reads the token server-side, validates tile coordinates, forwards only
   image responses, preserves attribution, and never returns the credential.
2. Building footprints and optional covered pedestrian features are served by one private
   environment query service. The service reads immutable versioned files, verifies Overture
   checksums, requires bearer authentication for data and metadata, and enforces bbox,
   timeout, payload, and result-count limits.
3. Cheap configuration readiness remains at `/api/health`. A separate protected
   `/api/health/live` performs bounded provider probes for release validation and scheduled
   monitoring so paid upstream calls are not placed on every platform health poll.

The National Weather Service adapter must use an identifying User-Agent with a monitored
contact URL or email. Production readiness fails closed when it is missing or a placeholder.

Covered-feature data remains optional. `REQUIRE_RAIN_COVER=false` means the app must report
rain-cover capability as unavailable rather than infer protection from buildings or another
region. Broad `Stay Dry` claims require a reviewed deployed dataset and a ready private
provider.

## Consequences

- Provider credentials and local data files remain outside the browser.
- Map, building, and cover providers can change without altering environmental engines or
  React components.
- Application deployment and environment-data deployment can roll back independently.
- Live health is more expensive than readiness and must be protected and scheduled.
- The repository is deployable, but release approval still requires production secrets,
  durable data-service deployment, legal review, centralized alerting, and final smoke
  evidence.

## Alternatives Considered

### Direct Mapbox Tiles From The Browser

Rejected for the MVP because it would require a public browser token and a separate client
credential policy. The same-origin route keeps the current server-side secret boundary.

### Bundle Overture Stores Into The App Worker

Rejected because the stores are large, independently versioned, and unsuitable for worker
filesystem assumptions.

### Treat Building Footprints As Rain Cover

Rejected because nearby building geometry does not prove a pedestrian route is under
continuous overhead cover.
