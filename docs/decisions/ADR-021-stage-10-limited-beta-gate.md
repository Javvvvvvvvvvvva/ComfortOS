# ADR-021 - Stage 10 Limited-Beta Gate

Date: 2026-08-16
Status: Accepted

## Context

Stage 9.6 validated the three climate archetypes and selected managed Mapbox walking routing.
Stage 10 audited whether that validated engineering system is deployable as a real limited
MVP. The audit found strong provider abstractions and model evidence, but also production
dependency, credential, latency, legal, and operational gaps.

## Decision

ComfortOS is `READY AFTER P0 FIXES`, not currently ready to admit external beta users.

The limited MVP product surface is:

```text
Map + manual/geolocation origin
-> Fastest walking route
-> progressive contextual Comfort analysis
-> relative route explanation
-> official NWS alert priority
```

Active Navigation, Future Departure, and the consumer Comfort Map are hidden until their
production contracts are complete.

Geographic behavior is capability-based. Minneapolis, Seattle, and Phoenix are validation
regions, not city-name switches. Unsupported areas may receive managed walking routing and
weather, but environmental candidates are not comparable without the required regional
data. No other region's buildings or cover may be substituted.

Launch geography follows Option C: all three regions may be presented as beta/preview only
after their declared capabilities are deployed, with one primary region selected from
post-fix production evidence. Stage 10 recommends Phoenix as the first primary region because
its corrected full live heat suite is complete, all 18 routes activate heat with comparable
data, and its Comfort latency is below the UI timeout. Equal Fastest/Stay Cool selection is a
valid current-condition result; controlled suites retain reranking evidence.
Minneapolis remains preview until the >12-second common Comfort tail is fixed. Seattle remains
preview until its rain-cover service and coverage claim are production-ready.

The P0 release gate is the checklist in
`docs/release/MVP_RELEASE_CHECKLIST.md`. It includes credential rotation, production geocoder
and basemap, valid NWS identification, durable building deployment, location/privacy/legal
work, monitoring, and Minneapolis latency remediation or explicit launch-scope reduction.

## Consequences

- A smaller honest product ships before unfinished navigation and planning surfaces.
- `Fastest` remains useful when environmental capability is partial or unavailable.
- Three-climate validation is preserved without making three-city production-readiness claims.
- Environment capability and provider readiness become explicit runtime/operational states.
- Stage 6 custom environmental routing remains research-only.
- Stage 10 ends without beginning a post-MVP stage.

## Alternatives Considered

- **Minneapolis only:** rejected for the present recommendation because the measured Comfort
  tail exceeds the 12-second UI timeout on common routes.
- **All three cities equally launch-ready:** rejected because Seattle cover deployment and
  Minneapolis latency are not ready.
- **Do not proceed toward beta:** rejected because the bounded product architecture, managed
  routing, deterministic engines, live climate validation, and honest fallback behavior are
  sound once the finite P0 deployment work is completed.
