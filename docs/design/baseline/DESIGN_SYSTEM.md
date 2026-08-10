# ComfortOS — Design System (extracted from prototype baseline)

Source: `docs/design/baseline/source/latest/ComfortOS-Prototype-Round2.dc.html`, Round 2. All values below are read directly from that file's inline styles and logic, not inferred from screenshots.

## Typography

Two families, loaded via Google Fonts:

- **Manrope** (400/500/600/700/800) — all UI text and all numerals. Numerals use `font-variant-numeric: tabular-nums` (class `.num`) so times/percentages/temperatures don't jitter width when they change.
- **Newsreader** (400 regular + 400 italic) — serif, used only for city name / editorial headline moments (Home city label, Comfort Map title). Never used for numbers or body copy.

Hierarchy observed (semantic naming, not px-locked):

| Token | Prototype value | Usage |
|---|---|---|
| `text-display` | Manrope 800, 20–22px | Route time ("Comfort · 10 min"), tradeoff % |
| `text-headline-serif` | Newsreader 400, 19px | City name, screen titles ("Comfort Map") |
| `text-body` | Manrope 600, 15–17px | Search CTA, destination name |
| `text-label` | Manrope 600, 12–13px | Comfort Score line, condition text, chip labels |
| `text-caption` | Manrope 500/700, 9–11px | Recommended eyebrow, legend, map street labels, PREVIEW tag |

No text below 9px (map street labels are the floor, and they're decorative, not load-bearing information).

## Color — semantic tokens

The system is **constant chrome + shifting environmental accent**: base surface/text tokens never change across cities; only `accent` and the comfort-color spectrum respond to data.

### Surfaces (light / dark)

| Token | Light | Dark |
|---|---|---|
| `surface-app` (`bg`) | `#EDE9E2` | `#14181C` |
| `surface-primary` (`card`) | `#FAF7F2` | `#1D2228` |
| `surface-secondary` (`cardAlt`) | `#F2EDE3` | `#20262C` |
| `text-primary` | `#14181C` | `#F2EDE3` |
| `text-secondary` (`subtext`) | `#6B665C` | `#9A968C` |
| `divider` | `#E4DFD6` | `#2A3138` |

### Map surfaces

| Token | Light | Dark |
|---|---|---|
| `map-bg` | `#E7E2D6` | `#10141A` |
| `map-street` (`mutedLine`) | `#C9C2B4` | `#333B42` |
| `map-building` | `#D8D2C4` | `#1A2027` |
| `map-park` | `#B9C4AC` | `#26332A` |

### City accent (`accent`) — the one hue that shifts

| City | Accent | Meaning |
|---|---|---|
| Minneapolis | `#E8A33D` (warm amber) | shelter/sun benefit, "Stay Warm" |
| Seattle | `#4E8C8A` (slate-teal) | dryness/cover benefit, "Stay Dry" |
| Phoenix | `#D97757` (terracotta) | shade/cool benefit, "Stay Cool" |

`accentSoft` = accent + alpha (`33` dark / `2A` light) — used for predictive-banner background only.

### Route semantic colors (independent of city accent)

| Token | Value | Usage |
|---|---|---|
| `route-fastest` | `text-secondary` (muted, no accent) | Fastest is deliberately unglamorous |
| `route-comfort` | `#4F8B85` (fixed teal, same in every city) | Comfort route always reads as "the safe universal pick" |
| `route-context` | city `accent` | Stay Warm/Dry/Cool — the one city-flavored route |

### Comfort/environment spectrum (universal, city-independent)

A single 2-stop interpolation from `rgb(193,82,58)` (uncomfortable/exposed) to `rgb(79,139,133)` (comfortable/protected), used for: Comfort Score number color, Comfort Map segment color at any layer, legend gradient swatch. This is deliberately **not** city-accent-colored, so "how comfortable" always reads on the same scale regardless of which city you're viewing — only the route/context accent is city-flavored.

Semantic names for implementation:
- `environment-comfortable` → teal end (`#4F8B85`)
- `environment-exposed` → red-amber end (`#C1523A`)
- `environment-moderate` → interpolated midpoint (~`#D9A648`)
- Per-condition reads (`environment-wind`, `environment-rain`, `environment-shade`, `environment-heat`, `environment-cold`) are **not separate colors** in this system — they reuse the same comfortable→exposed spectrum, distinguished instead by *texture* (see below). This is intentional: the brief calls for perceptual "protected vs. exposed" reading over data-dashboard color-coding per metric.

## Environmental texture language (accessibility + distinctiveness)

Color alone never carries meaning. Every scored map segment renders as two strokes:
1. **Halo** — same hue, wide, blurred (`filter: blur(3–4px)`), low opacity (opacity scales with score) — the "atmosphere" glow.
2. **Core** — the actual street line, width scales with score (more comfortable = thicker/more present), plus a **dash pattern keyed to the active layer**, present only when score < 50 (i.e., only exposed segments get textured):
   - Rain layer: fine dots (`2 6`)
   - Wind / Sun & Shelter layer: medium dashes (`5 6`)
   - Shade / Heat layer: fine dashes (`1 5`)
   - Comfort layer (aggregate): solid always — no texture, since it's the summary read

Two soft blurred `ellipse` "atmosphere" blobs (city-accent-colored and universal-teal-colored, opacity ~0.1) sit under the Comfort Map layer as ambient mood, not data.

## Spacing & radius

- Screen padding: 16–20px horizontal, consistently.
- Card/sheet radius: 10px (route cards), 12–16px (search CTA, comfort gauge, floating buttons), 18px (map container corners), 20px (bottom-sheet top corners only — flat bottom, sits on device edge).
- Chip radius: 14–20px (fully rounded pills) for all selector controls (dev city switcher, time options, layer options).
- Gap scale in use: 4, 6, 8, 10, 12, 14, 16, 20px — no arbitrary in-between values.

## Elevation

Flat design, no card borders. The only shadows: `0 2px 12px rgba(0,0,0,0.12)` on the primary search CTA, `0 2px 8px rgba(0,0,0,0.15)` on the floating Comfort Map button, `0 4px 16px rgba(0,0,0,0.2)` on the segment-detail floating card. Route cards and chips have **no shadow** — differentiated by fill/border-left accent only, keeping the sheet flat and calm rather than stacked-card-heavy.

## Light/dark mode

Full parallel theme object computed at render time from one `dark` boolean; every token above has a light and dark value. Dark mode is not just an inverted-lightness pass — surfaces shift warm-neutral (light) vs. cool-graphite (dark) rather than pure black/white. City accents and the comfort spectrum are unchanged between modes (same hex in both) — only surfaces/text/map tokens flip.

## Map treatment

Muted, desaturated "realistic basemap" mock: layered street hierarchy (9px arterials at ~55% opacity, 2.5px local streets at ~35% opacity), building-footprint rectangles at varied per-building opacity (0.6–0.95) to fake density/depth, one soft rounded park shape, 3 small rotated street-name labels (9px, letter-spaced, uppercase). This basemap is intentionally generic/replaceable — the brief is explicit that the *environmental layer* above it, not the basemap, should carry the product's visual identity.
