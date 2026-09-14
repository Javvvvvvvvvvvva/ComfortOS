# ComfortOS Final UI Refinement

Status: implemented and browser-validated on September 13, 2026.

This document records the production UI refinement applied to the live ComfortOS
map. It complements the Round 2 design baseline and does not alter engine contracts,
routing policy, or provider normalization.

## Product Hierarchy

1. Keep the live map full-bleed and visually primary.
2. Keep brand and current origin weather in compact floating controls.
3. During planning, show only trip points, contextual search, location, and the
   route-comparison action.
4. After routing, collapse trip editing to a one-line origin/destination summary.
5. Put route candidates, recommendation, duration, distance, and the primary
   tradeoff above all environmental detail.
6. Hide raw environmental metrics behind `Why this route?` progressive disclosure.
7. Put coverage, data, privacy, terms, and support in a compact information menu.

## Route Result Contract

- A route card always includes a role, duration, and distance.
- The selected recommendation uses the Comfort teal route treatment.
- The recommendation label is separate from the route role.
- The first explanation is shown directly on the route card.
- Loading, limited-data, and failure messages remain visible when they affect route
  comparability.
- Complete-state explanation is not repeated below the selected route card.

## Environmental Detail

The expanded detail order is:

1. Outdoor Comfort score, confidence, and completeness
2. Heat exposure and direct-sun estimate
3. Rain exposure and covered distance
4. Estimated building shade
5. Estimated wind exposure

Official alerts remain assertive. Environmental estimates remain subordinate to
official alerts and include the existing disclaimer.

## Responsive Behavior

- Mobile uses a bottom sheet with compact and expanded maximum heights.
- Opening `Why this route?` expands the available reading area.
- Editing a completed trip temporarily hides route cards to keep the form focused.
- Desktop uses a 424 px edge-anchored route workspace and reserves right-side map
  padding so the selected geometry remains visible.
- Zoom controls sit below the brand group, outside the route panel.
- Fixed-format controls use stable dimensions and no viewport-scaled typography.

## Visual System

- Neutral white and cool-gray surfaces replace the previous dominant cream palette.
- Signal Yellow and Deep Ink identify Ahhway without being reused as route scores.
- Comfort teal remains the selected-route color.
- Origin amber and destination coral remain distinct map semantics.
- Blue is reserved for keyboard focus.
- Interactive containers use a 6 px radius; the mobile sheet alone uses 12 px top
  corners to communicate its sheet behavior.
- Trip points and route choices are compact divided lists rather than repeated cards.
- Desktop brand and live conditions share one joined cartographic toolbar.
- Solid surfaces replace glass blur, gradients, and decorative AI-product effects.
- Lucide icons are used for navigation, search, location, information, reset, and
  disclosure controls.

## Validation Record

- 390 x 844 planning state: no horizontal overflow or clipped controls.
- 390 x 844 routed state: map remains primary with the recommendation visible above
  the fold.
- 390 x 844 expanded detail: internal sheet scrolling preserves access to every
  environmental metric.
- 1280 x 800 planning and routed states: route geometry remains outside the floating
  panel and all primary actions remain visible.
- Live Mapbox place search was exercised with Target Field and Minneapolis Institute
  of Art.
- Live walking routing, current NWS weather, humidity display, and the five existing
  environmental analyses were exercised together.

## Higgsfield Brand Asset

The final ComfortOS symbol was generated through Higgsfield with `gpt_image_2_5` and
then reviewed at full size and at the 24-30 px product size. It depicts an amber origin,
a coral destination, a white walking path, and a shelter arc on the existing Comfort
teal field.

- Accepted Higgsfield job: `29f4c884-c113-4bd4-9686-bfa98ec0a19d`
- Archived source: `docs/assets/brand/comfortos-mark-higgsfield-source.png`
- Runtime-optimized asset: `public/brand/comfortos-mark.png`
- Product use: map-shell brand mark and browser/application icon

An earlier generated candidate was rejected because its silhouette could be confused
with a phone or headset at small sizes. Generated imagery remains subordinate to the
data-bearing map and is not used as decorative route content.

## Higgsfield Interface Direction

Higgsfield was also used for responsive product art direction rather than as a source
of production markup. The generated boards established the edge-anchored desktop
workspace, compact mobile route list, joined map toolbar, restrained corner radii,
and teal/amber/coral semantic hierarchy. Generated gradients and invented map data
were deliberately excluded from implementation.

- Desktop direction job: `24121fba-5717-4fea-9ddd-bc0ae448762c`
- Mobile direction job: `f960d6a8-a9fc-4ecd-86fd-baf96e82015a`
- Desktop board: `docs/assets/brand/comfortos-higgsfield-ui-desktop.png`
- Mobile board: `docs/assets/brand/comfortos-higgsfield-ui-mobile.png`
- Production implementation: local React components and deterministic domain state

## Public Brand And Accessibility

The consumer product is named **Ahhway**, with the promise **Take the nicer walk.**
ComfortOS remains the internal deterministic engine and architecture name. The public
voice favors short, familiar prompts such as `Where to?`, `Pick your walk`, and
`Why this one?`; official alerts and safety limitations remain direct and serious.

The accepted Higgsfield Ahhway mark depicts one continuous route finding its way
through layered weather bands. It avoids letters, smiles, arrows, pins, and leaves so
the silhouette is specific to climate-aware wayfinding rather than a generic delivery,
mapping, or sustainability product. It is used in the map toolbar, metadata icons,
and policy-page navigation.

- Accepted mark job: `59efffcd-3e63-455c-8fa4-4978910adfe1`
- Accepted source: `docs/assets/brand/ahhway-signal-mark-a.png`
- Final Deep Ink source: `docs/assets/brand/ahhway-mark-deep-ink-source.png`
- Runtime asset: `public/brand/ahhway-mark.png`
- Color direction job: `730a984e-8487-4aff-9bf7-73a5beada060`
- Color direction board: `docs/assets/brand/ahhway-signal-ui-direction.png`

The earlier lowercase `a` and wink was superseded because its smile-like underline
could be mistaken for Amazon branding at product size. A weather-tile alternate
(`22efd2f4-f5d7-4006-abc7-22e35bd85a83`) was archived because it read as a generic
forecast app rather than a route product.

Signal Yellow (`#F7C843`) is the public brand signal because it behaves like a
wayfinding sign, remains visible over blue and green map regions, and does not favor
heat, rain, or winter as a single climate identity. Deep Ink (`#17262B`) provides the
grounding wordmark and action color. The production icon uses white weather bands on a
Deep Ink field for maximum small-size contrast; Signal Yellow remains a compact accent
under the brand lockup. Comfort teal (`#16766A`) is intentionally reserved
for comfortable-route semantics; origin amber, destination coral, and focus blue keep
their existing functional meanings.

Accessibility additions include reduced-motion support, stronger high-contrast tokens,
forced-color selection boundaries, 44 px primary controls, text-plus-icon route states,
and an explicit check mark in addition to the selected-route color.
