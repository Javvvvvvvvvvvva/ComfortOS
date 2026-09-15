# ADR-033 - Native Mobile Client Boundary

Date: September 14, 2026
Status: Accepted

## Context

Ahhway's map, place search, weather context, and route comparison are useful on a phone, but
the existing product is a browser client. Packaging that browser in a WebView would not give
the product a native location or map experience and would duplicate the current web surface
without adding meaningful mobile behavior.

The ComfortOS engines also contain provider credentials, environment-service access, and
deterministic calculations that must not move into a downloadable application binary.

## Decision

Build the mobile client as a native Expo and React Native application under `apps/mobile`.
The initial client targets Expo SDK 57, React Native 0.86, iOS, and Android from one
TypeScript codebase.

The mobile application owns:

- foreground location permission and current-position selection;
- native map rendering, origin/destination markers, and route polylines;
- managed place-search interaction through the Ahhway API;
- Fastest-first progressive route feedback;
- Comfort candidate selection and normalized explanation presentation;
- current weather, official alert, limited-data, timeout, and failure states; and
- mobile accessibility semantics and haptic confirmation.

The server remains the sole owner of:

- Mapbox routing and search credentials;
- R2 and environment-service credentials;
- NWS normalization;
- candidate generation and route reranking;
- shade, wind, rain, heat, snow, ice, and aggregate Comfort calculations; and
- provider metadata, capability gates, confidence, completeness, and comparability.

The application consumes the existing normalized `/api` routes. No `EXPO_PUBLIC_*`
variable may contain a Mapbox, R2, weather-service, or environment-service secret. The public
runtime settings in v1 are the Ahhway API base URL and policy-site URL.

iOS uses the platform map in development. Android uses the platform Google map and requires
an application-restricted Google Maps key before a signed store build. This map provider is
presentation only; managed Mapbox walking remains the server routing provider.

Foreground location is used only to choose a trip origin. Background tracking, active
navigation, off-route detection, and automatic rerouting remain outside this decision and
stay hidden until their separate product and privacy gates are accepted.

## Validation

- Mobile TypeScript application and test configurations pass.
- Mobile deterministic request and presentation tests pass 7/7.
- Expo Doctor passes 21/21 SDK and dependency checks.
- Metro produces both iOS and Android Hermes bundles.
- A live mobile API smoke passes provider health, managed place search, NWS weather,
  Fastest walking, and Comfort comparison.
- The smoke returns five candidates, five comparable analyses, managed Mapbox provider
  metadata, and no public OSRM provider.

Native simulator and physical-device visual validation remain a release gate because the
current development workstation does not have Xcode or an Android SDK installed.

## Consequences

- Web and mobile remain separate presentation layers over one deterministic backend.
- Native releases can improve maps, location, haptics, and deep links without forking the
  Comfort calculation model.
- Public API compatibility becomes an explicit mobile release concern.
- TestFlight and Play testing require a production HTTPS API, store credentials, platform
  map configuration, device permission testing, and a completed privacy review.

## Alternatives Considered

### WebView Wrapper

Rejected because it would be a repackaged website and would not establish the native product
behavior needed for maps, location, accessibility, and later route progress.

### Replace The Web Application With Expo

Rejected because the deployed web application and its operational pages remain useful, and
rewriting them would add risk without improving the deterministic engine.

### Move Comfort Calculation On Device

Rejected because it would expose provider boundaries, create divergent model versions, and
make environmental-data updates depend on app-store releases.
