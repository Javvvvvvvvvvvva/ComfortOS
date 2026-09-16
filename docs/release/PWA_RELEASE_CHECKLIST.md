# Ahhway PWA Release Checklist

Date: September 15, 2026
Release candidate: `0.1.0`
Distribution: public HTTPS web application
Current judgment: **PUBLIC PORTFOLIO RELEASE LIVE**

## Product And Installability

- [x] The route-planning product is the first screen; no marketing interstitial blocks use.
- [x] Web manifest defines Ahhway name, colors, standalone display, and install icons.
- [x] Apple home-screen metadata and touch icon are present.
- [x] Service worker caches only the app shell and static assets.
- [x] Search, location, route, weather, and environment API responses are never cached.
- [x] Offline navigation shows an explicit connection-required state instead of stale data.
- [x] Desktop and 390 x 844 mobile route-result screenshots pass visual inspection.
- [x] Native Expo source remains intact for a later store release.

## Product Boundaries

- [x] The fastest route remains usable independently of environmental analysis.
- [x] Environmental estimates are not presented as safety or medical guarantees.
- [x] The product does not claim active turn-by-turn or background navigation.
- [x] Confidence, completeness, and comparability remain distinct.
- [x] Current place, weather, and route providers remain behind normalized server interfaces.
- [x] Precise route coordinates remain out of URLs and structured logs.

## Verification

- [x] `npm run typecheck`
- [x] `npm test` - 287/287 passing
- [x] `npm run lint`
- [x] `npm run build`
- [x] `node --check public/sw.js`
- [x] `git diff --check`
- [x] Manifest and service-worker URLs respond in the local release candidate.
- [x] Live Phoenix search, NWS weather, managed routing, and Comfort analysis pass.
- [x] Public deployment status is successful.
- [x] Public URL passes post-deployment resource and route smoke checks.

## Public Operations

- [x] Privacy, terms, support, coverage, and data-source routes are included.
- [x] Production credentials are configured outside source control.
- [x] Managed routing has no public OSRM fallback.
- [ ] Confirm centralized error and uptime monitoring before describing the service as an
  operationally supported production product.
- [ ] Obtain human legal review before representing the policy pages as legal advice or final
  commercial terms.
- [ ] Add a custom domain when the project needs a permanent branded address.

## Distribution Decision

The public PWA and GitHub case study are the first distribution surfaces under ADR-036.
Apple App Store and Google Play work is deferred, not abandoned. Resume store work only when
product demand or a native-only capability justifies the recurring account and release cost.

## Public Release Evidence

- Public URL: `https://ahhway.javacoding2022.chatgpt.site`
- Sites version: 11
- Source commit: `5832123a642b18dd77919838ca52c7d32c1b895e`
- Unauthenticated home, manifest, service worker, privacy, and support requests returned `200`.
- Minneapolis, Seattle, Phoenix, and the unsupported Puerto Rico boundary passed the public
  Stage 10 route smoke.
- Each supported scenario returned five candidates and five comparable environmental
  analyses; the unsupported boundary returned zero comparable analyses.
- Public Comfort latency was 2,615 ms in Minneapolis, 3,586 ms in Seattle, and 1,119 ms in
  Phoenix for this release check.
- Phoenix activated the heat context and `Stay Cool`; managed routing issued no public OSRM
  fallback.

This is a public portfolio release, not an operational-support claim. The aggregate readiness
endpoint remains intentionally not-ready until centralized monitoring and human legal review
are complete.
