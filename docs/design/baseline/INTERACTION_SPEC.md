# ComfortOS — Interaction Spec (from prototype baseline)

Source: `docs/design/baseline/source/latest/ComfortOS-Prototype-Round2.dc.html`. Every interaction below is traced to an actual handler in the prototype's logic class (`setCity`, `goScreen`, `setTime`, `selectRoute`, `toggleDetail`, `startNav`, `exitNav`, `setLayer`, `selectSegment`, `toggleDark`).

## CONSUMER INTERACTION (real product behavior)

### Destination
- Tap the Home search CTA → Route Comparison for a fixed mock destination. *(No real search/autocomplete interaction exists yet — see gap list.)*

### Route selection & comparison
- Tap any route card → selects it (`selectedRoute`), redraws the map (selected route glows + halo, others mute to background-street color), closes any open detail panel.
- Only the selected card exposes its secondary actions: "Why this route?" (non-fastest only) and "Start."
- Tap "Why this route?" → toggles the Environment Detail panel open/closed within the same sheet (`toggleDetail`). Re-selecting a different route auto-closes it.
- Tap "Start" → enters Active Navigation (`startNav`).

### Departure time / prediction
- Tap a time chip (Now / two future clock-time options, city-specific) → swaps the entire scenario: temperature, condition, comfort score, and all 3 routes' times/reasons update together (`setTime`).
- If a future time is more comfortable, a predictive banner appears automatically (not user-triggered) beneath the time chips.
- Tap the predictive banner → jumps directly to that better time bucket (`jumpPredictive`).

### Comfort Map
- Tap "Comfort Map" (floating button on Home's map) → navigate to the full Comfort Map screen (`goComfortMap`).
- Tap a layer chip (city-specific set, e.g. Comfort/Wind/Sun & Shelter for Minneapolis) → recolors and re-textures all street segments for that layer, clears any open segment detail (`setLayer`).
- Tap a street segment → shows a floating detail card (name + score for the active layer); tap the same segment again → hides it (`selectSegment`, toggle behavior).

### Navigation
- Back chevron (Comparison, Comfort Map) → returns to Home (`goHome`).
- Exit (×) during Active Navigation → always returns to Home, never back to Route Comparison (`exitNav`). This is a deliberate simplification in the prototype; production should confirm whether "exit nav → home" or "exit nav → comparison" is the intended real behavior before Stage 0.

### Appearance
- Light/dark toggle (sun/moon glyph, top-right on every non-nav screen) → flips the whole theme (`toggleDark`). This *is* a legitimate consumer-facing control (unlike the city switcher) — dark mode is a real product feature for nighttime walking per the design guidelines.

---

## DEVELOPER / DEMO INTERACTION (prototype-only, must not ship as-is)

### City switcher
- Tap MSP / SEA / PHX chip (dashed-border "PREVIEW" pill, top-left on every non-nav screen) → switches the entire mock dataset to that city's scenario, and resets navigation-adjacent state (time back to "Now," route back to "Comfort," any open detail/segment selection cleared) (`setCity`).
- This exists **only** to let reviewers validate the design across all three climate scenarios in one file. Its visual treatment (dashed border, small-caps "PREVIEW" label, distinct from every real control's pill styling) is intentional so it reads as a debug affordance, not a feature.
- **It must not become a production city-selection UI.** Per the architecture spec, the real app determines city context from device location automatically; there is no normal-user flow for picking a city by name in this design.
- It is hidden during Active Navigation (`showChrome = !navMode`), reinforcing that it's a preview tool layered *around* the consumer experience, not part of it.

### Debug/raw-data visualization
- None exists in this prototype — no graph-node, edge-ID, raw-shadow-polygon, or cost-value overlay is built anywhere. If engineering needs a developer overlay for validating shade/wind/routing data later (per architecture spec §26 "Developer / Debug Mode"), it should be built as a clearly separate mode, following the same visual-separation principle as the city switcher (never blended into consumer chrome).

---

## State model reference (for engineering)

The prototype's state shape (for context, not to be copied verbatim — production state should be driven by real query/route results, not a flat mock switch):

```
city: 'mn' | 'sea' | 'phx'              — DEV PREVIEW ONLY, not a real app concept
screen: 'home' | 'comparison' | 'comfortmap'
timeKey: 'now' | '+30' | '+60'          — maps to city-specific clock labels
selectedRoute: 'fastest' | 'comfort' | 'context'
detailOpen: boolean
navMode: boolean                          — overlays everything, hides dev chrome
layer: string                             — comfort map layer id, city-specific set
selectedSegment: string | null            — comfort map tapped-segment id
dark: boolean                             — real consumer setting
```

Every piece of *content* driven by `city` + `timeKey` (temperature, wind, comfort score, route times/reasons, predictive text, per-segment scores) is mock data — see `README.md` → Mock Data and each screen's note in `SCREEN_SPEC.md`.

---

## Gaps to resolve before Stage 0 (interaction-relevant)

1. No real destination search/autocomplete interaction — Home CTA jumps straight to a fixed mock destination.
2. No drag gesture on the Route Comparison bottom sheet (brief calls for swipe up/down; only fixed layout + internal scroll exists).
3. Active Navigation's turn instruction is a single static string, not a sequence — no interaction model yet for advancing through turns.
4. No Official Weather Alert / safety-override interaction exists — undefined how it would interrupt the flows above.
5. Exit-from-navigation destination (Home vs. back to Comparison) is a prototype simplification, not a confirmed product decision.
