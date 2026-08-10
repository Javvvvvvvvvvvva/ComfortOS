# ADR-001 — Stage 0 Map And Routing Providers

Date: 2026-08-07
Status: Accepted

## Context

Stage 0 needs a real interactive Minneapolis walking map and a real pedestrian route without building the future ComfortOS environmental routing engine. The architecture still needs provider isolation so future routing can move to Comfort-aware graph routing without rewriting UI components.

## Decision

Use MapLibre GL JS for client map rendering with OpenStreetMap raster tiles for the Stage 0 basemap.

Use the FOSSGIS `routing.openstreetmap.de` OSRM foot service as the Stage 0 walking-routing provider through a `RoutingProvider` adapter. Application code talks to the `RoutingService` and normalized `RouteRequest` / `RouteResult` models, not directly to OSRM response structures.

## Consequences

This gives Stage 0 a real OSM-compatible walking route with no token or account requirement. The provider is suitable for prototype and low-volume development use, but it has public-service usage limits and no uptime guarantee. Production must either use a contracted routing provider, a hosted OSRM/Valhalla/GraphHopper service, or ComfortOS-owned routing infrastructure.

The UI currently shows only the Fastest route. Comfort Score, environmental reduction claims, contextual routes, and microclimate guidance remain absent until real environmental engines exist.

## Alternatives Considered

- `router.project-osrm.org`: public OSRM demo server, but walking profile behavior is historically inconsistent and car-profile-focused.
- Commercial routing APIs: stronger guarantees, but most require tokens and introduce provider lock-in before Stage 0 needs it.
- Custom ComfortOS A* routing engine: target architecture direction, but explicitly out of scope for Stage 0.
