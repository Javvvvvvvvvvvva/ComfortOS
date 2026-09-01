# ADR-002 — Stage 0.5 Geocoding Provider

Date: 2026-08-08
Status: Accepted for Stage 0.5; superseded for production by ADR-022

## Context

Stage 0.5 needs real U.S. address/place search, reverse geocoding for map taps and current location, and search suggestions while preserving provider independence. The app must not build a custom places database, and React components must not parse provider response structures.

## Decision

Use Photon as the Stage 0.5 geocoding adapter. Photon is an open source geocoder built on OpenStreetMap data, supports search-as-you-type, location bias, country filtering, and reverse geocoding. The current default endpoint is the public demo service:

```text
https://photon.komoot.io
```

All Photon responses are normalized into:

```ts
type PlaceResult = {
  id: string;
  name: string;
  address?: string;
  coordinate: Coordinate;
  category?: string;
};
```

The app calls a `GeocodingProvider` through server API routes. UI components only consume normalized `PlaceResult` objects.

## Consequences

Photon provides a token-free way to validate the Stage 0.5 search UX and keeps the data stack OpenStreetMap-compatible. The public demo endpoint is not a production dependency: extensive usage may be throttled or banned. Production should use a contracted geocoding provider, a hosted Photon/Pelias/Nominatim instance, or another provider behind the same interface.

Nominatim's public OpenStreetMap service was not selected for autocomplete because its usage policy explicitly forbids client-side autocomplete/search-as-you-type. MapTiler, OpenCage, Mapbox, Google Places, and similar providers may offer better production support, but they introduce API keys, billing, and provider terms before Stage 0.5 needs them.

## Alternatives Considered

- Public Nominatim: strong OSM address geocoding, but unsuitable for autocomplete and has strict public-service limits.
- MapTiler Geocoding: good autocomplete and predictable session pricing, but requires an API key/account.
- OpenCage: strong geocoding API, but free access is trial/testing only and rate limited.
- Commercial places APIs: higher quality POI/business search, but introduce cost and provider lock-in.
