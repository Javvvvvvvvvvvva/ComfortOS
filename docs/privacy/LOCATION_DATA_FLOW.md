# ComfortOS Location Data Flow

Date: 2026-08-16
Status: Technical inventory for privacy and legal review

This document describes implemented behavior. It is not a privacy policy and does not
invent retention promises that the application does not enforce.

## Data Flow

| User action | Data leaving browser | ComfortOS server use | External recipient |
| --- | --- | --- | --- |
| Use my location | precise latitude/longitude after browser permission | origin selection, weather, routing, environment analysis | Mapbox through route requests; NWS through weather requests; building/cover services through bboxes; reverse geocoder when requested |
| Search a place | search text | geocoding proxy | configured geocoder; currently Photon public demo in development |
| Select route endpoints | precise origin and destination | normalized walking request and candidate generation | Mapbox Directions API |
| Load weather | one precise coordinate | NWS point/station/forecast/alert flow | National Weather Service |
| Analyze environment | route-derived bounding boxes and geometry | normalized building/cover lookup and deterministic engines | privately deployed building/cover services; no direct browser access |
| Load map | viewport tile coordinates, IP/user-agent at network layer | none in app API | configured basemap provider; currently OSM community tiles in development |

The browser geolocation permission is optional. Manual search and map selection remain
available when permission is denied or unsupported.

## Current Application Retention

The application has no user account, route-history database, search-history database, or
analytics SDK. Origin, destination, current location, route geometry, and weather state are
held in browser memory for the active page session. The API does not intentionally persist
them to an application database.

Location-derived API responses use `Cache-Control: private, no-store`, and client requests
use `cache: no-store`. The in-process weather cache uses rounded coordinates and a short TTL
to reduce NWS traffic; it is ephemeral process memory, not a user history.

This does not mean there is zero external retention. Hosting platforms and external
providers can observe IP address, timestamp, User-Agent, requested URL, and request payload
under their own logging and retention practices. Mapbox receives route coordinates. NWS
receives a weather coordinate. The configured geocoder receives search text and may receive
proximity context. The basemap provider receives tile requests that imply viewport area.

## Server Logging

Stage 10 structured logs intentionally exclude fields whose names indicate tokens, secrets,
authorization, cookies, coordinates, latitude/longitude, origin, or destination. Logs use a
request ID, provider/mode, coarse capability region, context, latency, candidate count, and
failure category. Provider error messages and internal stack traces are not returned to the
consumer.

Before beta, verify the hosting platform does not independently log request bodies or full
query strings for location endpoints. Configure log redaction and a reviewed retention
period at that layer.

## Analytics Recommendation

Do not add a third-party analytics SDK merely to launch. Start with aggregated server-side
event counts using coarse capability region and no precise coordinates. Candidate events are:

```text
route_requested
fastest_ready
comfort_completed
comfort_same
comfort_different
comfort_limited
context_cold
context_rain
context_heat
route_selected
```

`navigation_started` must not be emitted while Active Navigation is hidden. Any later
analytics vendor requires a privacy review, consent decision, data-processing terms, and
retention configuration before integration.

## Pre-Beta Privacy Actions

- Publish a reviewed Privacy Policy that identifies Mapbox, NWS, the geocoder, basemap, and
  hosting/logging processors.
- Decide and configure server/platform log retention.
- Verify request-body and URL redaction in production logs.
- Document provider retention and subprocessors.
- Add a contact route for privacy and support requests.
- Re-audit if accounts, saved routes, analytics, crash replay, or active navigation are
  introduced.
