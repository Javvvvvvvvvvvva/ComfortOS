# ADR-005: Stage 2 Shadow Geometry Engine

Date: 2026-08-08
Status: Accepted

Stage 2.5 amendment date: 2026-08-09

## Context

Stage 2 must calculate time-dependent building shadows and route shade ratios with deterministic geometry. Meter-based shadow projection cannot be performed directly in longitude/latitude degrees.

## Decision

ComfortOS uses:

- SunCalc for deterministic solar azimuth/elevation from latitude, longitude, and ISO timestamp.
- A local meter projection centered on the analysis bbox for short-distance shadow vectors.
- Turf for GeoJSON measurement, route segmentation support, polygon hull generation, and selected geometry operations.

Building shadow length is approximated as:

```text
heightMeters / tan(solarElevation)
```

The shadow direction is opposite the solar azimuth. Shadows are capped to avoid absurd geometry near the horizon. If the sun is below the horizon, the model returns an explicit nighttime state instead of building shadow polygons.

Stage 2.5 replaces the production 5 m line-sampling shade calculation with exact route-segment line clipping against shadow polygon intervals. Overlapping shadow intervals are unioned before distance aggregation so overlapping buildings do not double-count shade. The old sampler remains only as a development comparison helper.

Stage 2.5 also evaluates solar position at each route segment midpoint time. Segment entry, midpoint, and exit timestamps are assigned deterministically from route departure time, route duration, and distance along the route.

## Consequences

- Shade is timestamp dependent and not stored as a permanent street property.
- Route shade is evaluated from route geometry outside the routing provider.
- Stage 2 provides a debug layer for validating buildings, shadows, route segments, and shaded/exposed sections.
- Production segment shade length no longer depends on meter-sized point sampling.
- Debug output includes per-segment estimated times, solar position, exact shaded/exposed lengths, and confidence inputs.

## Non-Goals

- No tree canopy.
- No solar radiation intensity or UV comfort cost.
- No alternate route ranking.
- No Comfort Score.
