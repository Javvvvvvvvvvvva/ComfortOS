# Ahhway Mobile Store Release Checklist

Date: September 15, 2026
Release candidate: `0.1.0 (1)`
Bundle identifiers: iOS and Android `com.ahhway.app`
Current judgment: **REPOSITORY READY; EXTERNAL RELEASE GATES OPEN**

This checklist separates work proved by source and automated tests from work that requires
store accounts, production URLs, signed binaries, physical devices, or a human legal review.
An unchecked external gate must not be described as complete.

## Repository Gates

- [x] Native Expo client uses the normalized Ahhway API; no engine calculation or provider
  credential is included in the client.
- [x] Foreground location is optional and manual search/map selection remains available.
- [x] Fastest route appears before Comfort analysis and remains usable when Comfort fails.
- [x] API calls have bounded timeouts, caller cancellation, stale-response protection, and
  an in-place route retry.
- [x] Official weather alerts remain separate from ordinary route recommendations.
- [x] Confidence, completeness, and comparability remain distinct.
- [x] Unavailable overhead-cover data is not displayed as measured `0 m` coverage.
- [x] Privacy, terms, coverage, sources, and support are reachable from the app.
- [x] The iOS privacy manifest declares precise location and search use for app functionality,
  no tracking, and the Required Reason APIs used by the bundled SDKs.
- [x] The iOS build declares that it does not use non-exempt encryption; ordinary HTTPS
  transport remains enabled and ATS arbitrary loads remain disabled.
- [x] Production config rejects local, placeholder, and non-HTTPS API or policy URLs.
- [x] Android production config rejects a missing Google Maps key.
- [x] Cost-bearing public APIs use bounded per-client application limits plus atomic D1 edge
  limits and return `429` with `Retry-After`; raw client addresses are not persisted.
- [x] iOS ATS disallows arbitrary HTTP loads.
- [x] App icon, adaptive icon, monochrome icon, and splash assets exist.
- [x] Primary native controls, route choices, map interaction, and modal actions expose
  explicit accessibility roles, labels, state, or hints where visual context is insufficient.
- [x] The checked-in nationwide environment release covers 50 states and D.C.; metro climate
  validation remains labeled separately from data deployment.
- [x] Managed Mapbox routing has no public OSRM fallback.
- [x] Runtime npm audit has no known vulnerabilities. Expo build-tool advisories are tracked
  without applying an incompatible forced downgrade.

## Automated Release Commands

Run these from the repository root immediately before creating a signed build:

```bash
npm run release:preflight
npm --prefix apps/mobile run smoke:api
npm run smoke:stage11:nationwide -- --base-url https://YOUR_API_ORIGIN
```

The same deterministic checks run on every push and pull request through
`.github/workflows/ci.yml`. Use `npm run release:preflight -- --skip-network` only when the
Expo API is temporarily unreachable; that mode is not sufficient for a signed release.
The preflight also creates fresh production-profile iOS and Android Hermes exports in a
temporary directory, verifies the configured HTTPS origin is embedded, scans for server
credentials and local API addresses, and removes the temporary artifacts.

Then produce both store binaries from the same commit:

```bash
cd apps/mobile
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest build --platform android --profile production
```

## External P0 Gates

- [x] Expo/EAS project `@javacoding2022/ahhway` is created and the owner/project ID are
  pinned in the dynamic app config.
- [ ] Deploy the public web/API service and record non-placeholder HTTPS values for
  `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_SITE_URL` in the EAS production environment.
- [ ] Verify `/privacy`, `/terms`, `/coverage`, `/data-sources`, and `/support` at the final
  public site origin.
- [x] Configure a Google Maps Android key restricted to `com.ahhway.app`, the release signing
  SHA-1 `2F:36:AA:48:66:D2:6E:29:6D:CD:53:07:F0:5D:4E:93:09:24:A3:CB`, and Maps SDK for
  Android.
- [ ] Enroll/verify Apple Developer and Google Play Console accounts; accept current
  agreements and complete tax/banking records where requested.
- [ ] Create App Store Connect and Play Console app records. Add the App Store Connect Apple
  ID as `submit.production.ios.ascAppId` only after the record exists.
- [ ] Create or let EAS manage signing credentials, then retain account recovery and signing
  ownership information outside the repository.
- [ ] Replace console-only observability with a monitored production destination and prove
  routing, weather, building, timeout, quota, and billing alerts reach an incident owner.
- [ ] Have a qualified reviewer approve the privacy notice, terms, attribution, provider
  retention, support process, and store privacy answers.
- [x] Create a separate Ahhway production Mapbox token and switch Ahhway local and hosted
  runtime configuration to it. The pre-existing default token remains untouched because it
  is owned by another application.
- [x] D1-backed edge limiting is deployed and probed in the owner-only production runtime;
  repeat the same probe after changing to the final public audience.

## Signed-Binary And Device Gates

- [ ] Inspect the generated iOS privacy report and reconcile every SDK declaration with App
  Store Connect privacy answers.
- [ ] Confirm a release IPA contains no secret, development URL, local IP, or debug menu.
- [ ] Confirm a release AAB contains no server credential and renders Google Maps correctly.
- [ ] Test iPhone small/standard/large widths, at least one current iOS version and the oldest
  supported version.
- [ ] Test one current Android phone plus the oldest supported API level and a low-memory
  device profile.
- [ ] Exercise location allow, approximate, deny, system-disabled, timeout, and retry paths.
- [ ] Exercise offline launch, network loss during Fastest, network loss during Comfort,
  provider 429/5xx, empty search, no walking route, and limited environmental data.
- [ ] Complete VoiceOver and TalkBack reading order, control names, Dynamic Type/font scaling,
  contrast, reduce-motion, and touch-target checks.
- [ ] Verify map attribution, privacy links, support link, severe weather alert treatment, and
  the no-safety-guarantee disclaimer in the signed app.
- [ ] Capture store screenshots from the signed release candidate, not the web UI or Expo Go.
- [ ] Upload to TestFlight and Play internal testing, resolve automated store warnings, and
  complete at least one outside-device route in each of Minneapolis, Seattle, and Phoenix.

## September 14 Evidence

- Root deterministic/integration suite: 287 passed.
- Mobile request, release-config, and presentation suite: 11 passed.
- Root and mobile TypeScript: passed.
- ESLint and production web build: passed.
- Expo Doctor: 21/21 passed.
- Vinext compatibility scan: 100%, with no partial or unsupported imports.
- iOS and Android production-profile Hermes exports: passed, 3.6 MB bytecode each.
- Production bundle scan: expected HTTPS API present; no local API address, Mapbox public
  token, R2 credential name, or audit-only Android key in JavaScript.
- Mobile live API smoke: ready, managed geocoding, NWS weather, five candidates, five
  comparable candidates, managed Mapbox routing.
- Stage 11 representative nationwide smoke: 9/9 passed, 45 managed routing requests, maximum
  2,832 ms, expected Overture release `2026-08-19.0`.
- Stage 10 boundary smoke: Minneapolis, Seattle, and Phoenix comparable; Puerto Rico correctly
  returned zero comparable environmental candidates.
- Metadata isolation probe: Minneapolis -> Phoenix -> cached Minneapolis preserved the correct
  state partitions and building counts.
- Public readiness remains `not-ready` because legal review is pending and observability is
  still console-only. Provider readiness and protected live health pass.
- GitHub `Release CI` passed both Web and engine and Mobile jobs from a clean Linux checkout.
- The nationwide deployment attestation is Git-tracked separately from the host-local active
  runtime pointer, so typecheck and production web builds no longer depend on ignored files.
- Expo/EAS authentication and project linkage were verified for `@javacoding2022/ahhway`.
- EAS generated and assigned the default Android production keystore; iOS credentials and
  both store submission credentials remain intentionally unset until store-owner login.
- Sites v5 applied the D1 migration and hosted hash secret. A live weather request returned
  limit `60`, remaining `59`, and the persisted client key was a 64-character digest rather
  than a raw address; readiness reported `cloudflare-d1` as production-ready.
- The production web build bundles MapLibre's module worker through Vite's worker pipeline.
  Browser validation confirmed a rendered Mapbox raster map with no worker console errors.
- Sites v6 verified JSON-body location requests: live weather and managed place search
  returned `200`, legacy location-query `GET` returned `405`, and unique coordinates, search
  text, session identifiers, authorization headers, and credentials were absent from the
  corresponding hosted logs.
- Sites v7 serves the bundled 506,723-byte MapLibre worker and a real Minneapolis Mapbox tile
  with `200` responses. GitHub Release CI passed exact commit `e3b91a5`.
- A new Google Cloud project, `Ahhway Production` (`ahhway-production-20260915`), is linked to
  paid billing. Its `Ahhway Android Production` key is limited to Maps SDK for Android,
  `com.ahhway.app`, and the EAS release SHA-1. EAS stores it as a Sensitive production-only
  variable; the value is absent from source and logs.
- A new Mapbox token, `Ahhway Production Routing 2026-09-15`, was created without changing or
  revoking the pre-existing default token. Direct Directions, Search Box, and tile probes
  returned `200`; the app API reported `mapbox-managed` and `mapbox-directions-walking` with
  no public OSRM fallback.
- Sites deployment `appgdep_6aa8e570e3248191af2c0ce9da0f2edc` published version 8 with
  environment revision 4. The owner-only audience was preserved.
- The post-rotation Stage 10 smoke passed Minneapolis, Seattle, Phoenix, and the Puerto Rico
  unsupported boundary. Runtime and Sites log scans found no Mapbox token, Google key,
  credential name, or public OSRM endpoint.

## Release Decision

Approve store submission only when every External P0 and Signed-Binary gate is checked and
the exact commit, app build numbers, environment deployment ID, API release, and rollback
owner are recorded. Ahhway v1 is a pre-walk route comparison product; it must not be listed
as turn-by-turn navigation, emergency guidance, or a guarantee of shade, cover, snow removal,
ice-free pavement, accessibility, or personal safety.
