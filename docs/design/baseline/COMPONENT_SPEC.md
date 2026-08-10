# ComfortOS — Component Spec (from prototype baseline)

Source: `docs/design/baseline/source/latest/ComfortOS-Prototype-Round2.dc.html`. These are conceptual contracts extracted from how the prototype actually builds each piece — not React implementations. Field names below mirror the prototype's own `renderVals()` shapes where useful, but should be treated as a starting contract, not a locked API.

---

### SearchBar
**Purpose**: primary navigation-first CTA on Home; opens destination entry.
**Required data**: placeholder text ("Where are you going?").
**Optional data**: none currently — no live query/autocomplete exists yet (see Screen Spec §2 gap).
**Variants**: CTA/button variant only (large, icon + label, tap target). No inline-typing variant built.
**States**: default, pressed (implicit via cursor). No focus/typing/results states — not implemented.
**Interactions**: tap → navigate to Route Comparison.
**Accessibility**: needs a real `<input>`/button semantic and label in production; prototype uses a styled `div` with onClick only.

---

### EnvironmentSummary
**Purpose**: compact ambient-conditions readout.
**Required data**: city name, temperature, "feels like" (implied, present in mock data but currently only surfaced in the Route Comparison detail panel — not shown on Home in Round 2's compact header), wind description, one-line condition text.
**Optional data**: none.
**Variants**: only one variant currently (compact, Home-screen header). No expanded/detail variant — environment detail lives in a separate component (EnvironmentDetail, see below).
**States**: none beyond the data changing per city/time.
**Interactions**: none — purely informational.
**Accessibility**: temperature/condition should be read as one sentence for screen readers ("18 degrees, feels like 4, cold and windy"), not as isolated fragments.

---

### ComfortScore
**Purpose**: single number representing overall estimated comfort; supports decisions, not a standalone metric to optimize.
**Required data**: score (0–100), interpretive label/condition text.
**Optional data**: none — no trend/history shown.
**Variants**: two found in source — (a) donut/gauge variant (`gaugeStyle`/`gaugeInnerStyle`, conic-gradient ring) built in Round 1 and still present in the logic but **no longer rendered** in Round 2's Home screen (superseded by the compact inline number); (b) inline compact variant (`{{comfortColor}}`-tinted number + label), currently used. **Recommendation**: retire the unused donut code path in implementation rather than carrying two variants forward, unless a future screen wants the fuller gauge treatment.
**States**: color continuously interpolates comfortable→exposed by score; no fixed "buckets" or badges (no "Good/Bad" chips) — deliberately avoids gamification per design guidelines.
**Interactions**: none, display-only.
**Accessibility**: must not rely on color alone in production — pair with the existing text label (already done) and ensure the numeric value has a text equivalent for screen readers, not just a colored digit.

---

### RouteCard
**Purpose**: the core decision unit in Route Comparison.
**Required data**: `key` (fastest/comfort/context), `label`, `time` (min), `dist`, `recommended` (bool), `accent` color, `selected` (bool).
**Optional data**: `topReason` + `otherReasons[]` (comfort/context only), `deltaLabel` (vs. fastest), `note` (fastest only, single exposure caveat).
**Variants**: Fastest (no tradeoff strip, plain note), Comfort (tradeoff strip + teal accent, always `recommended:true` in this prototype), Context (tradeoff strip + city-accent, name varies: Stay Warm/Dry/Cool).
**States**: default / selected (border-left accent + elevated background `cardAlt`) / (selected + expanded, via child "Why this route?" + Start controls appearing only when selected).
**Interactions**: tap card body → select; tap "Why this route?" (selected + non-fastest only) → toggle EnvironmentDetail; tap "Start" (selected only) → enter Active Navigation.
**Accessibility**: card should be a real button/radio-group item (currently a styled div); selected state must be exposed via `aria-pressed`/`aria-selected`, not just visual border color.

---

### RouteComparison
**Purpose**: the container/orchestrator — the list of ≤3 RouteCards + the map above them.
**Required data**: array of route data (see RouteCard), currently selected key.
**Optional data**: predictive banner text.
**Variants**: none — always 3-card layout in this prototype (brief allows exactly Fastest + Comfort + one contextual, max 3 — respected).
**States**: mirrors RouteCard selection; owns which card is "expanded."
**Interactions**: selecting a card redraws the route-preview map synchronously.
**Accessibility**: should be a single radiogroup semantically (only one route "active" at a time).

---

### RecommendedBadge
**Purpose**: subtle, non-promotional marker on the Comfort route.
**Required data**: none beyond presence (`recommended: true`).
**Variants**: single variant — small uppercase eyebrow label in the route's accent color. No icon, no exclamation, no "BEST!" styling (explicitly avoided per design guidelines).
**States**: static.
**Interactions**: none.

---

### ContextRouteBadge — **not a separate component in the prototype**
The prototype does not build a distinct "Stay Warm/Dry/Cool" badge component; the contextual route's name *is* its RouteCard label, and its accent color is the only visual differentiator from Comfort. If a distinct badge is wanted later (e.g. to also show the label somewhere the Comfort route already dominates), it should reuse the same eyebrow-label pattern as RecommendedBadge but in the city accent color.

---

### EnvironmentInsight (tradeoff strip)
**Purpose**: fuse "time cost" and "comfort benefit" into one legible visual unit (Round 2's answer to "make the tradeoff instant").
**Required data**: `deltaLabel` (e.g. "+2 min"), `topReason` (e.g. "31% less wind exposure").
**Optional data**: `otherReasons[]`, rendered smaller below the strip.
**Variants**: one — tinted pill (route accent at low alpha), delta + arrow glyph (→) + bolded top reason.
**States**: static once a route is selected/shown.
**Interactions**: none (purely presentational; selection happens at the card level).
**Accessibility**: should read as one sentence ("Two minutes longer, thirty-one percent less wind exposure"), not as two disconnected fragments.

---

### BottomSheet
**Purpose**: map + sheet interaction shell for Route Comparison.
**Required data**: sheet content (route list, time selector, predictive banner, detail panel).
**Optional data**: none.
**Variants**: only a fixed-position variant is built (sheet occupies remaining height below a fixed 200px map band) — no drag-to-expand/collapse gesture is implemented (brief calls for swipe-up/down; not present in this prototype, flagged as a gap).
**States**: static height; content within it can grow (detail panel toggle) and the sheet scrolls internally (`overflow:auto`) if content exceeds the space.
**Interactions**: internal scroll only; no drag handle behavior (a visual handle bar exists but is decorative, not functional).
**Accessibility**: if drag-to-resize is added later, must have a non-gesture (button/keyboard) equivalent.

---

### LayerSelector
**Purpose**: switch which environmental score is painted on the Comfort Map.
**Required data**: array of `{id, label}` layers (city-specific set), active id.
**Optional data**: none.
**Variants**: pill-chip row, 2–3 options depending on city.
**States**: active (filled, inverted text/bg) / inactive (`cardAlt` background).
**Interactions**: tap → recolor map + clear any open segment detail.
**Accessibility**: should be a real tab/radio group.

---

### PredictionTimeSelector
**Purpose**: choose "Now" vs. two future departure buckets.
**Required data**: 3 `{key, label}` options with city-specific clock-style labels (Round 2 change from generic "+30 min").
**Optional data**: predictive insight banner (separate component, rendered adjacent — see below).
**Variants**: single pill-row variant.
**States**: active/inactive per chip.
**Interactions**: tap → swap entire scenario (conditions, comfort score, all 3 route times/reasons) for that time bucket.
**Accessibility**: real radiogroup; time labels should also be available as full accessible names (not just "3:30 PM" with no date/context if ambiguous).

---

### Predictive banner (called out separately from PredictionTimeSelector in source, worth naming as its own component: `PredictiveInsight`)
**Purpose**: proactively surface a better departure time without the user hunting for it.
**Required data**: composed message string ("Better at 3:30 PM · +9 Comfort · wind expected to weaken").
**Optional data**: none — currently a single pre-composed string per time bucket, not structured fields. **Recommendation for implementation**: structure this as `{ time, comfortDelta, mechanism }` rather than a flat string, so it can be localized/reformatted.
**Interactions**: tap → jumps directly to that time bucket.

---

### MapLegend
**Purpose**: explain the current layer's color/texture meaning, minimally.
**Required data**: gradient swatch (fixed 3-stop CSS gradient, universal), one line of legend text keyed to the active layer.
**Optional data**: none.
**States**: legend text changes with active layer; swatch itself never changes (same comfortable↔exposed spectrum regardless of layer).

---

### SegmentDetail
**Purpose**: on-demand detail for a single tapped street segment on the Comfort Map.
**Required data**: segment name, score, active layer label.
**Optional data**: none currently (no shade/wind/rain breakdown per segment — only the single active-layer score). A fuller version could show all relevant metrics per segment; not built.
**States**: shown/hidden (`selectedSegmentInfo`), toggles off on re-tap of same segment or on layer change.
**Interactions**: tap segment → show; tap same segment again → hide.
**Accessibility**: floating card should be announced (e.g. `aria-live`) when it appears, since it's the result of a map tap with no other feedback.

---

### NavigationInstruction
**Purpose**: primary turn-by-turn instruction during Active Navigation.
**Required data**: instruction text, distance.
**Optional data**: none.
**Variants**: single variant, always rendered on the route's accent-colored card.
**States**: static per the prototype (single hardcoded instruction — real implementation needs a sequence).
**Interactions**: none (passive display).

---

### MicroclimateGuidance
**Purpose**: ComfortOS's differentiator inside navigation — secondary, ambient environmental heads-up.
**Required data**: title (short, e.g. "Wind shelter in 300 ft"), subtitle (supporting duration/extent phrase, e.g. "Protected for the next 6 min") — two-tier structure added in Round 2.
**Optional data**: none.
**States**: static per city in this prototype (one guidance message shown continuously, not a sequence of guidance events over the walk — real implementation needs to advance guidance as the user progresses).
**Interactions**: none.

---

### OfficialWeatherAlert — **not built**
Design guidelines specify this must override normal comfort messaging during real NWS alerts (safety > comfort). Not present anywhere in the prototype. Must be designed and built before Stage 0 if severe-weather handling is in scope for MVP — flagged as a gap, not a decision to omit permanently.

---

### Dev Preview City Switcher (prototype-only, not a product component)
**Purpose**: let reviewers flip between the three climate scenarios without building a real location/city-selection flow.
**Required data**: 3 city buttons (MSP/SEA/PHX), active city.
**Visual treatment**: dashed border, small caps "PREVIEW" label — deliberately styled to look unlike any consumer control, so it can't be mistaken for a real feature by reviewers or accidentally reused as a city-selection pattern.
**Must not** be carried into production as a user-facing city picker — production determines city from location automatically per the architecture spec.
