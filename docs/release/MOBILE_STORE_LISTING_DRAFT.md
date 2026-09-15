# Ahhway Store Listing Draft

Date: September 14, 2026
Status: Copy-ready draft; legal, localization, screenshots, and store-account fields remain
subject to final review.

## Apple App Store

**Name:** Ahhway

**Subtitle:** Take the nicer walk

**Primary category:** Navigation

**Secondary category:** Weather

**Promotional text:** Compare the fastest walk with routes shaped by current weather and
estimated shade, wind, rain, heat, and winter exposure.

**Description:**

Ahhway helps you compare walking routes for the conditions outside right now. Pick a start
and destination, see the fastest available walk first, then compare it with a route selected
using current National Weather Service conditions and estimated street exposure.

Depending on local data, Ahhway can consider building shade, direct sun, pedestrian wind,
rain exposure, heat, snowfall, and ice accumulation. Every result keeps confidence,
completeness, and data availability visible. When environmental data is limited, Ahhway says
so and keeps the fastest route available.

Ahhway works across all 50 U.S. states and Washington, D.C. Foreground location is optional;
you can choose both trip points with search or the map.

Ahhway compares routes before you walk. It does not provide turn-by-turn navigation,
emergency guidance, accessibility certification, or a safety guarantee. Always follow
official alerts and observe actual street and weather conditions.

**Keywords:** walking,route,weather,shade,heat,rain,snow,wind,map,outdoors

**Review notes:**

1. No account or login is required.
2. Location permission is optional and used only to choose a starting point.
3. Denying location still permits search and long-press map selection.
4. The app displays Fastest first; Comfort comparison can arrive afterward or report limited
   data.
5. The app intentionally does not provide active navigation.
6. Use a U.S. route during review because weather and environmental coverage are U.S.-scoped.

## App Privacy Draft

Conservative App Store Connect answers for final legal verification:

- Tracking: **No**.
- Data linked to identity: **No**; Ahhway has no account or persistent user identifier.
- Precise Location: collected for **App Functionality** when a user grants foreground access
  or selects precise trip coordinates; not used for tracking.
- Search History: search queries are transmitted for **App Functionality**; Ahhway does not
  build a persistent search-history database.
- Diagnostics/Product Interaction: **No** for the current binary because no analytics or
  crash-reporting SDK is integrated. Re-answer before release if one is added.
- Abuse prevention: the API stores a short-lived request counter keyed by a salted one-way
  hash of the hosting provider's network address. The app does not store the raw address in
  that counter. Legal review must determine the final Apple "Other Data" and Google device-ID
  answers for this server-side processing before submission.
- Contact, financial, health, contacts, photos, audio, advertising, and purchases: **Not
  collected** by the current binary.

Provider and hosting processing still needs final contract/retention review. The signed IPA
privacy report is the final technical input, not this draft alone.

## Google Play Draft

**Short description:** Compare walking routes for the weather and street exposure right now.

**Data Safety:** Precise location is optional, used for app functionality, encrypted in
transit through the required HTTPS API, not used for advertising or tracking, and not linked
to an Ahhway account. Search text and selected trip points are processed to return results.
Validate whether provider processing qualifies as collection or sharing under the current
Play Console definitions before answering the form.

## Required URLs

- Privacy policy: `https://FINAL_SITE/privacy`
- Terms: `https://FINAL_SITE/terms`
- Support: `https://FINAL_SITE/support`
- Coverage: `https://FINAL_SITE/coverage`
- Data sources: `https://FINAL_SITE/data-sources`

Do not submit placeholder URLs. The production config intentionally rejects them.

## Screenshot Matrix

Capture from the signed release candidate with real but non-sensitive route examples:

1. Trip planning with optional location and place search.
2. Fastest-first loading state.
3. Fastest versus a distinct contextual Comfort route.
4. Route details with confidence and completeness.
5. Limited-data state with Fastest preserved.
6. Official weather alert shown separately from the recommendation.

Capture required current iPhone and Android form factors after checking every image for
personal locations, tokens, debug controls, clipped text, stale weather, and misleading cover
claims.
