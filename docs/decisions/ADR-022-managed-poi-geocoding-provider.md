# ADR-022 - Managed POI and Geocoding Provider

Date: 2026-08-21
Status: Accepted

## Context

The Stage 0.5 Photon public-demo integration remained in the consumer search path through
Stage 10. User validation exposed stale business identity data: a current venue could
appear under a previous tenant's name. The Stage 10 readiness audit had already classified
the lack of a production geocoder as a P0 release blocker.

ComfortOS needs current U.S. address and POI search without exposing provider response
shapes to React components or coupling routing and environmental engines to a search
vendor.

## Decision

ComfortOS selects Mapbox Search Box API v1 as the managed MVP POI and geocoding provider.
Production configuration is:

```text
GEOCODING_PROVIDER=mapbox-managed
MAPBOX_SEARCH_ACCESS_TOKEN=<server-side token>
```

`MAPBOX_ACCESS_TOKEN` is accepted as a server-side fallback so routing and search can use
the existing credential during local validation. Deployment should use a dedicated,
restricted search token.

Interactive search follows the provider's session contract:

```text
UI query -> /suggest -> normalized PlaceSuggestion
UI selection -> /retrieve -> normalized PlaceResult with coordinate
Map/current-location lookup -> /reverse -> normalized PlaceResult
```

Provider IDs remain opaque, closed results are omitted when the provider supplies an
operational status, and all results are temporary UI data. ComfortOS does not persist or
cache Search Box results.

The configured provider fails closed. Missing credentials or managed-provider failures do
not fall back to public Photon. Photon remains available only in explicit
`photon-public` development mode or behind an explicit `photon-self-hosted` endpoint.

## Security and Operations

- Access tokens are read only by server-side provider construction.
- Tokens are never returned in provider metadata, API responses, errors, or structured
  logs.
- Search and retrieve routes use `private, no-store` responses.
- Search sessions use a distinct UUID and end when the user retrieves a result.
- The client debounce remains in place to stay within provider rate limits.
- Search results are temporary under the provider terms and are not written to application
  storage.

## Consequences

- Current POI/business data is no longer limited to the public Photon/OSM demo index.
- The original `PlaceResult` boundary remains intact for selected locations.
- Search suggestions may omit coordinates until selection, represented by the normalized
  `PlaceSuggestion` model.
- Search now has a managed-provider cost and quota dependency that must be monitored.
- Provider freshness improves but is not an absolute guarantee; individual listing errors
  still require verification and upstream correction.

## Alternatives Considered

### Continue public Photon

Rejected for the MVP consumer path because its demo service is not production eligible and
the reported business-identity freshness was insufficient.

### Mapbox Geocoding API v6 only

Rejected for POI search because Geocoding v6 no longer provides POI data. It remains an
address-geocoding product, while Search Box is the appropriate interactive POI API.

### Build a ComfortOS places database

Rejected as outside product scope and contrary to the architecture specification.
