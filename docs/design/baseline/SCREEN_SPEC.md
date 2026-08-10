# ComfortOS — Screen Spec (from prototype baseline)

Source: `docs/design/baseline/source/latest/ComfortOS-Prototype-Round2.dc.html`. The prototype implements 3 of the 7 target consumer screens as fully interactive (Home, Route Comparison, Comfort Map) plus a lightweight Active Navigation state. Destination Search, Future Departure (as a standalone screen), and Environment Detail (as a standalone screen) are implemented as **embedded states** within other screens rather than separate screens — noted per-screen below.

---

## 1. Home / Map

**Purpose**: orient the user (where am I, what does it feel like) and get them into a search as fast as possible.

**Primary user action**: tap "Where are you going?" → Route Comparison.

**Information hierarchy** (top to bottom, per Round 2 revision):
1. City name (small, serif) + compact temp/wind readout — top-right, secondary
2. Comfort Score number (color-coded) + one-line condition — compact single row, not a dominant gauge
3. **"Where are you going?"** — full-width prominent CTA, strongest visual weight after the numbers
4. Ambient map (fills remaining space) — desaturated comfort-scored streets at reduced opacity/scale, "Comfort Map" entry button floating top-right of the map

**Visible components**: EnvironmentSummary (compact variant), ComfortScore (inline variant, no donut), SearchBar (CTA variant), ambient Comfort Map preview, MapLegend absent here (legend only on full Comfort Map).

**Important states**: none beyond city/time/dark — this screen has no destination yet, so no route is drawn; only the ambient per-segment comfort coloring (all 14 mock segments, half-opacity halo) plus a pulsing origin dot.

**Interactions**: tap search CTA → Route Comparison (destination is a fixed mock, "Anchor Coffee Co." — there is no live destination-search/autocomplete screen in this prototype; see Component Spec / Interaction Spec for what's missing). Tap "Comfort Map" pill → Comfort Map screen.

**Environmental adaptation**: temp/wind/comfort/condition text and ambient segment coloring all swap per city+time; layout is identical across all three cities.

**Mobile behavior**: single fixed-height column inside the iOS device frame, no scrolling — this is the "ambient, glanceable" screen, deliberately not scroll-heavy.

---

## 2. Destination Search — **not built as a separate screen**

The brief calls for a familiar search screen (Recent/Home/Work, nearby categories). The prototype **skips this**: tapping the Home CTA jumps straight to Route Comparison with a hardcoded destination. This is a known gap, not a design decision — flag before Stage 0 (see README/report).

---

## 3. Route Comparison

**Purpose**: the product's most important screen — make the recommended route and its time/comfort tradeoff obvious within ~2 seconds, per the design guidelines.

**Primary user action**: select a route, then Start.

**Information hierarchy**:
1. Destination name + back chevron
2. Compact route-preview map (fixed 200px band, not full-height) showing the currently *selected* route glowing; other routes dim to background-street muted color
3. Bottom sheet: departure-time selector → predictive banner (if a better time exists) → up to 3 route cards → optional expanded "Why this route?" detail

**Visible components**: RouteCard ×3 (Fastest / Comfort / contextual), RecommendedBadge, PredictionTimeSelector, EnvironmentInsight (as the tradeoff strip), EnvironmentDetail (progressive-disclosure panel), BottomSheet.

**Important states**:
- Route selection (`selected` on exactly one card at a time; only the selected card shows "Why this route?" + Start)
- Detail panel open/closed (`detailOpen`, reset on every re-selection)
- Departure time (`now` / two future buckets, city-specific clock labels)

**Interactions**:
- Tap a route card → selects it, redraws the map route, closes any open detail panel
- Tap departure-time chip → swaps the whole scenario (temp/comfort/route times/reasons) for that bucket
- Tap predictive banner → jumps to the better time bucket directly
- Tap "Why this route?" → expands Environment Detail (shade/wind/rain %, confidence) inline in the sheet
- Tap "Start" → enters Active Navigation

**Route card content contract**: label, time, distance; for Comfort/contextual routes, a single combined **tradeoff strip** (`+2 min → 31% less wind exposure`, delta and top benefit in one visual unit) plus any secondary reasons below it; for Fastest, a plain exposure note instead of a tradeoff (it has no comfort benefit to trade off).

**Environmental adaptation**: route count is always ≤3 (Fastest, Comfort, one contextual route whose *name* changes: Stay Warm/Stay Dry/Stay Cool); reasons text is fully city-specific (wind% for Minneapolis, rain% for Seattle, sun% for Phoenix); what stays constant is the card layout, the tradeoff-strip pattern, and the recommended-badge treatment.

**Mobile behavior**: map band is fixed-height (not full-bleed) so the sheet — the actually important content — gets most of the screen; sheet content scrolls internally if the detail panel is open.

---

## 4. Comfort Map

**Purpose**: the signature "this city reveals how it feels" surface — explore comfort without a destination.

**Primary user action**: switch environmental layers, tap a street segment for detail.

**Information hierarchy**: back + title → layer selector chips → full-bleed scored map → legend strip (gradient swatch + one-line meaning of the current layer's texture).

**Visible components**: LayerSelector, MapLegend, SegmentDetail (floating card on tap), two ambient "atmosphere" blobs (mood only, not data-bearing).

**Important states**: active layer (city-specific set — see below); selected segment (`selectedSegmentInfo`, toggles off on re-tap or layer change).

**Interactions**: tap a layer chip → recolors/re-textures all 14 segments for that layer's score set; tap a segment path → floating card shows street name + numeric score for the active layer.

**Environmental adaptation** — this is the clearest test of "same architecture, different emphasis":
- Minneapolis layers: **Comfort, Wind, Sun & Shelter**
- Seattle layers: **Comfort, Rain, Wind**
- Phoenix layers: **Comfort, Shade, Heat**

Layer *labels and available set* change per city; the rendering mechanism (score → color + texture + halo) is identical across all three. Comfort layer is present in all cities and always renders solid/no-texture as the "summary" read.

**Mobile behavior**: map is full-bleed except for the top chip row and bottom legend strip.

---

## 5. Future Departure — **embedded, not a standalone screen**

Implemented as the departure-time row + predictive banner *within* Route Comparison, not a separate screen. Time options use real clock-style labels per city (e.g. Minneapolis: Now / 3:30 PM / 4:00 PM) rather than generic "+30 min" — Round 2 change. Predictive copy names the mechanism, not just the delta (e.g. "Better at 3:30 PM · +9 Comfort · wind expected to weaken").

If a standalone Future Departure screen is wanted later (e.g. for exploring *without* a destination, browsing comfort-over-time), it doesn't exist yet — flag before Stage 0.

---

## 6. Environment Detail — **embedded, not a standalone screen**

Implemented as the "Why this route?" progressive-disclosure panel inside Route Comparison's bottom sheet: estimated shade %, estimated wind exposure %, rain exposure %, and a plain-language confidence label (High/Medium). Hidden by default, one tap away. No standalone deep-dive screen (sources/provenance, per-city adapter info) exists in the prototype.

---

## 7. Active Navigation

**Purpose**: minimal turn-by-turn plus a secondary, ComfortOS-specific microclimate layer.

**Primary user action**: none — this is a passive/glance state; only action is Exit.

**Information hierarchy**: primary turn instruction (large, on an accent-colored card, top of map) → secondary "Microclimate guidance" block pinned to the bottom (two lines: a short title + a supporting duration/extent phrase).

**Visible components**: NavigationInstruction, MicroclimateGuidance (two-tier: title + subtitle).

**Important states**: entered only from a selected Comfort or contextual route card's Start button; exiting always returns to Home (not back to Route Comparison).

**Interactions**: tap × (top-right) → exit to Home.

**Environmental adaptation** (city-specific two-line guidance, Round 2):
- Minneapolis: "Wind shelter in 300 ft" / "Protected for the next 6 min"
- Seattle: "Covered walkway in 2 min" / "Reduced rain exposure for the next 0.3 mi"
- Phoenix: "Shade begins in 2 min" / "Shaded for ~5 min · high sun exposure ahead"

Turn instruction itself ("Turn right on Bridge Path · 300 ft") is currently a single hardcoded string regardless of city/route — this is mock/placeholder, not a designed adaptive behavior; production turn-by-turn will come from the routing engine per real geometry.

**Mobile behavior**: full-screen overlay (`position:absolute; inset:0`) over the device frame, replacing all chrome including the dev preview switcher (intentional — see Interaction Spec, consumer/dev separation).

---

## Cross-screen constants (what never changes between cities)

- Screen layout, component set, and interaction model per screen
- Card/chip shapes, radii, spacing
- Route semantics: Fastest muted, Comfort always teal, contextual route always city-accent
- Comfort Score color spectrum
- Maximum 3 routes, maximum ~3 comfort-map layers
- Dev-only city switcher position/styling (top of every screen except Active Navigation)
