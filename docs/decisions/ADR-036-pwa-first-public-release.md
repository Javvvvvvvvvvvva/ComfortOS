# ADR-036 - PWA-First Public Release

Date: September 15, 2026
Status: Accepted

## Context

Ahhway is ready to be used as a foreground, pre-walk route-comparison product. The web
client already owns the complete search, map, live-weather, Fastest, Comfort, explanation,
policy, and support experience. App Store distribution would add an annual developer fee,
signing and review work, and store-specific release operations before the project has public
usage evidence that justifies those costs.

The current product does not claim background turn-by-turn navigation. Its core workflows
fit the capabilities of a modern installed web application: foreground location permission,
interactive maps, route requests, responsive layouts, and a home-screen launch surface.

ADR-033 established a valid native client boundary. This decision changes the first public
distribution surface; it does not invalidate that architecture.

## Decision

Launch Ahhway publicly as an installable Progressive Web App over HTTPS.

The public web release includes:

- an application manifest with Ahhway identity, theme, and install icons;
- standalone home-screen presentation on supporting browsers;
- a minimal service worker for static shell assets and a branded offline explanation;
- no service-worker caching of route, weather, search, environment, or other `/api/`
  responses;
- responsive desktop and mobile product layouts;
- public privacy, terms, support, coverage, and data-source pages; and
- the existing server-owned provider, credential, and deterministic engine boundaries.

The repository README becomes the portfolio and technical case-study entry point. It links
to the live product, uses current product screenshots, explains the user problem and
architecture, states validation evidence, and preserves honest product limits.

The Expo client remains in `apps/mobile` as a future distribution option. Native signing,
store submission, and paid developer-program work are deferred until usage, revenue, or a
native-only requirement justifies them. No native credential or project is deleted as part
of this decision.

## Validation

- The manifest and service-worker resources respond from the application origin.
- The service worker excludes every `/api/` request from caching.
- The production build, typecheck, lint, deterministic test suite, and secret audit pass.
- Current desktop and 390 x 844 mobile route-result screenshots have no incoherent overlap.
- Live place search, NWS weather, managed walking directions, and Comfort comparison pass in
  a Phoenix heat scenario.
- Public deployment preserves server-side credentials and managed provider metadata.

## Consequences

- Ahhway can be shared from one URL without App Store fees or review delay.
- iPhone installation requires the browser's Add to Home Screen flow and does not provide
  App Store discovery.
- Background navigation, native map behavior, and store distribution remain unavailable in
  the PWA release and must not be implied in product copy.
- Online connectivity remains required for live weather and route comparison. The offline
  surface explains that boundary instead of presenting stale route data.
- The native client can resume later against the same normalized API and engine contracts.

## Alternatives Considered

### Pay For Immediate App Store Distribution

Deferred because the recurring fee and external release work do not improve the current
foreground route-comparison engine or establish product demand.

### Ship A WebView Wrapper

Rejected for the same reasons recorded in ADR-033. It adds store operations without adding a
meaningfully native experience.

### Delete The Native Client

Rejected because the client already validates a useful future native boundary and can be
resumed without affecting the web launch.

### Publish Only A Static Portfolio

Rejected because the working route product is the strongest portfolio evidence. The public
application and its engineering case study should support each other.
