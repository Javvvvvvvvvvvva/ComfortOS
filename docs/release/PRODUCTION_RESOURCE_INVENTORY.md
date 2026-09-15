# Ahhway Production Resource Inventory

Last verified: September 15, 2026

This inventory prevents Ahhway release work from modifying credentials or projects owned by
other applications. It records identifiers and restrictions, never credential values.

## Isolation Rule

- Create a new, clearly named resource for Ahhway whenever an external provider resource is
  shared with or already used by another application.
- Do not rename, rotate, delete, restrict, or overwrite a pre-existing resource to repurpose
  it for Ahhway.
- Store credentials only in the owning provider, EAS, Sites, or ignored local environment
  files. Never commit credential values.
- Verify the selected project, app, package, and environment immediately before each change.

## Active Ahhway Resources

| Provider | Ahhway resource | Stable identifier | Configuration boundary | Status |
| --- | --- | --- | --- | --- |
| Google Cloud | Ahhway Production | `ahhway-production-20260915` | Paid billing; Maps SDK for Android only | Active |
| Google Maps Platform | Ahhway Android Production | Key value intentionally omitted | Android package `com.ahhway.app`; EAS release SHA-1 only | Active |
| Mapbox | Ahhway Production Routing 2026-09-15 | Token value intentionally omitted | Server-side routing, Search Box, and raster tiles; `styles:tiles`, `styles:read`, and `fonts:read` public scopes only | Active |
| Expo/EAS | `@javacoding2022/ahhway` | `37e24e5f-e04d-414f-870c-14c0aa54411d` | iOS/Android release builds | Active |
| Sites | Ahhway | `appgprj_6aa8b3a227748191b384505a0d999b31` | Owner-only web/API production runtime | Active, private |
| Cloudflare R2 | ComfortOS environment data | `comfortos-environment-data` | Nationwide environmental data archives | Existing Ahhway data resource |

The Mapbox default public token remains unchanged and is not the Ahhway production token.
The older Google Cloud project visible during setup also remains unchanged.

## Credential Placement

| Credential | Allowed locations | Client bundle policy |
| --- | --- | --- |
| Google Maps Android key | Google Cloud and EAS `production` as Sensitive | Expected in the Android native manifest; protected by package, SHA-1, and API restrictions |
| Mapbox production token | Sites secret environment and ignored local `.env.local` | Must not appear in web or mobile JavaScript bundles |
| R2 and environment-service credentials | Sites/Cloudflare secrets and ignored local environment | Must not appear in client bundles |

## Verification Record

- Google Maps key restriction: one API, one Android app, one release SHA-1.
- Mapbox direct probes after scope minimization: Directions `200`, Search Box `200`, raster
  tile `200`.
- Ahhway API probes: routing health `200`, managed Mapbox metadata, search `200`, tile `200`.
- Stage 10 climate smoke: Minneapolis, Seattle, Phoenix, and unsupported Puerto Rico passed.
- Secret scans: no Mapbox token, Google key, credential name, or public OSRM URL in runtime or
  Sites logs.
- Latest Sites deployment after credential rotation:
  `appgdep_6aa8e570e3248191af2c0ce9da0f2edc`, version 8, environment revision 4.

## Store Resources Still To Create

- Apple Developer enrollment is not enabled for the signed-in Apple Account, so a new
  `com.ahhway.app` App ID and App Store Connect record cannot be created yet.
- The signed-in Google Account has no Play Console developer account. Account type and legal
  identity must be chosen before creating the new Ahhway Play app record.
- Store records must be newly created for Ahhway. Do not reuse or rename another app record.
