# Ahhway Mobile App Foundation v1

Date: September 14, 2026
Status: **REPOSITORY HARDENED; EXTERNAL STORE GATES REMAIN**

## Delivered

- Expo SDK 57 native client in `apps/mobile`.
- Full-screen native map with Ahhway route, origin, and destination semantics.
- Foreground location permission with a manual search and map-selection fallback.
- Managed place search, reverse geocoding, current NWS weather, and official alert display.
- Progressive Fastest then Comfort route flow with bounded API timeouts and in-place retry.
- Fastest, contextual Comfort, limited-data, error, and equal-route presentation.
- Route selection, normalized tradeoff explanation, confidence, completeness, and
  environmental detail.
- Ahhway icon, splash screen, iOS bundle ID, Android package ID, and EAS build profiles.
- Product-information menu, policy links, production public-origin guards, Android map-key
  guard, iOS privacy and encryption declarations, accessibility labels, and top-level render
  recovery.
- No mobile-side environmental formula or provider credential.

## Automated Evidence

```text
Mobile TypeScript: pass
Mobile API, release-config, and presentation tests: 11/11 pass
Expo Doctor: 21/21 pass
iOS Metro/Hermes export: pass
Android Metro/Hermes export: pass
Live provider health: ready
Managed geocoding results: 6
NWS hourly forecast points: 156
Comfort candidates: 5
Comparable candidates: 5
Routing provider: mapbox-directions-walking / managed
Public OSRM fallback: none
```

The live smoke uses an existing Minneapolis validation route. It verifies the application
contract and provider path; it is not a replacement for the nationwide engine validation.

## Release Gates

The exact remaining gates, store copy, privacy answers, and screenshot matrix are maintained
in `docs/release/MOBILE_STORE_RELEASE_CHECKLIST.md` and
`docs/release/MOBILE_STORE_LISTING_DRAFT.md`. EAS project creation is currently blocked
because the local EAS CLI has no authenticated Expo account. Production HTTPS origins,
signing/store accounts, physical-device accessibility checks, signed screenshots, centralized
monitoring, and human legal approval also remain external gates.

`npm audit --omit=dev` currently reports a moderate `uuid` advisory through Expo's native
configuration and Xcode project tooling. The offered forced repair downgrades the SDK 57
splash package to an incompatible SDK 55 release, so it is not applied. Track the compatible
Expo upstream update before store release; no affected UUID API is called by Ahhway runtime
code.

Active navigation is not part of this foundation. The app compares walks before departure;
it does not claim background guidance, off-route detection, or automatic rerouting.
