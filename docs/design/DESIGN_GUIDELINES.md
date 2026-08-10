# ComfortOS — Product Design Guidelines v1.0

## 0. Purpose of This Document

이 문서는 ComfortOS의 UI/UX 및 Visual Product Design을 위한 최상위 디자인 기준이다.

이 문서는 특히 Claude Design과 같은 AI 디자인 도구가 ComfortOS의 제품 정체성을 정확하게 이해하고, 흔한 지도 앱이나 날씨 앱으로 단순화하지 않도록 하기 위해 작성되었다.

기술 구조와 데이터 모델에 관한 최상위 기준은:

`ARCHITECTURE_SPEC_V1.md`

를 따른다.

이 문서는 그 기술을 실제 사용자가 어떤 경험으로 만나야 하는지를 정의한다.

---

# 1. Product Design North Star

ComfortOS의 핵심 제품 질문:

> Where are you going, and what is the most comfortable way to get there right now?

우리는 사용자가 복잡한 기상 데이터나 도시 미세기후 모델을 공부하게 만들지 않는다.

내부에서는 매우 복잡한 데이터를 처리하지만 사용자가 이해해야 하는 것은 단순하다.

예:

**Fastest**
12 min

**Comfort**
14 min  
Recommended  
38% less wind exposure

사용자는 20개의 환경 지표를 보는 것이 아니라:

> "2분 더 걸리지만 훨씬 덜 춥다."

를 이해해야 한다.

---

# 2. Core Design Philosophy

ComfortOS는 다음 세 제품의 중간처럼 보이면 안 된다.

- Google Maps clone
- Weather app
- GIS dashboard

ComfortOS는 새로운 카테고리처럼 보여야 한다.

## Outdoor Comfort Navigation

제품 디자인의 핵심 느낌:

- calm
- intelligent
- environmental
- spatial
- predictive
- trustworthy
- human-centered

지나치게 futuristic하거나 sci-fi스럽게 디자인하지 않는다.

환경 데이터를 다루지만 전문 GIS 프로그램처럼 보이지 않는다.

---

# 3. Primary Design Principle

> Complexity belongs in the engine, simplicity belongs in the interface.

사용자에게는 가능한 한 적은 선택지를 제공한다.

예:

잘못된 디자인:

```text
Choose optimization:

☐ Shade
☐ Wind
☐ Temperature
☐ Humidity
☐ Rain
☐ AQI
☐ Snow
☐ UV
☐ Pollen
```

좋은 디자인:

```text
Fastest

Comfort
Recommended

Stay Warm
```

시스템이 현재 환경을 분석하여 어떤 factor가 중요한지 스스로 결정해야 한다.

---

# 4. Adaptive Interface Principle

ComfortOS의 UI는 도시와 현재 환경에 따라 변해야 한다.

모든 도시에서 동일한 route options를 보여주지 않는다.

---

## Phoenix — Summer

현재 상황:

108°F  
High UV  
Sunny

화면:

```text
Fastest
12 min

Comfort
14 min
Recommended

Stay Cool
15 min
62% less direct sun
```

---

## Minneapolis — Winter

현재 상황:

18°F  
Feels like 4°F  
NW wind 17 mph

화면:

```text
Fastest
8 min

Comfort
10 min
Recommended

Stay Warm
11 min
48% less wind exposure
```

---

## Seattle — Rain

현재 상황:

48°F  
Rain  
SW wind 9 mph

화면:

```text
Fastest
11 min

Comfort
13 min
Recommended

Stay Dry
14 min
57% less rain exposure
```

---

## Chicago — Strong Wind

현재 상황:

31°F  
Wind 24 mph

화면:

```text
Fastest
9 min

Comfort
11 min
Recommended

Avoid Wind
12 min
44% less wind exposure
```

---

# 5. Dynamic Route Mode

UI should NOT permanently display:

```text
Cool
Warm
Dry
Wind
Snow
Shade
```

Instead:

```text
Fastest

Comfort

[Context Route]
```

Context Route is selected dynamically.

Examples:

```text
Stay Cool
Stay Warm
Stay Dry
Avoid Wind
Snow-Safe
Cleaner Air
```

Maximum recommended visible alternatives:

**3**

Do not overwhelm users.

---

# 6. Primary User Journey

The main user flow should remain extremely short.

```text
Open App

↓

See Current Outdoor Condition

↓

Enter Destination

↓

View Routes

↓

Understand Recommendation

↓

Start Walking
```

The user should not need to configure weather settings before navigation.

---

# 7. Main Screens

The first design prototype must include at least these screens:

1. Home / Map
2. Destination Search
3. Route Comparison
4. Active Navigation
5. Comfort Map
6. Future Departure
7. Environment Detail
8. Profile / Preferences

Secondary screens can be designed later.

---

# 8. Screen 01 — Home / Map

This is the primary entry point.

The map should dominate the screen.

The interface should immediately answer:

### Where am I?

### What does outside feel like?

### Where do I want to go?

Example:

```text
Minneapolis

18°F

Feels like 4°F

NW 17 mph

Cold & Windy


Outdoor Comfort
42 / 100


[ Where are you going? ]
```

The weather information should not dominate the map.

ComfortOS is not a weather dashboard.

---

# 9. Home Environment Summary

Use human-readable environmental descriptions.

Instead of:

```text
Relative Humidity 67%
Wind Bearing 315°
Wind Velocity 7.6 m/s
```

show:

```text
18°F

Feels like 4°F

Strong NW wind
```

Technical details may be available after interaction.

---

# 10. Comfort Score

Use:

```text
Comfort
72
```

or:

```text
72
Comfortable
```

Avoid presenting Comfort Score as scientific certainty.

Do not use labels such as:

```text
Exact Comfort
True Temperature
Actual Comfort
```

Comfort is an estimated model.

---

# 11. Map as the Main Interface

The map should feel alive.

Environmental information should exist spatially.

Potential map layers:

- overall comfort
- shade
- heat
- wind
- rain exposure
- snow/ice
- air quality

But only one environmental visualization should normally dominate at a time.

Avoid displaying seven overlays simultaneously.

---

# 12. Comfort Map

Comfort Map is one of the signature features.

Traditional navigation:

```text
Road
Road
Road
```

ComfortOS:

```text
comfortable segment
hot segment
wind-exposed segment
shaded segment
```

The map should communicate:

> Different streets feel different.

This is a foundational visual concept.

---

# 13. Map Segment Interaction

If the user taps a street segment:

Example:

```text
Washington Ave

Comfort 78

Shade
82%

Wind exposure
Low

Sun exposure
18%

Surface
Dry
```

Technical confidence/source information can exist under:

**Why this estimate?**

but should not be shown by default.

---

# 14. Search Experience

Destination search should behave like a familiar modern navigation product.

Search field:

```text
Where are you going?
```

Suggestions:

```text
Recent
Home
Work

Coffee shops nearby
Restaurants
Parks
```

Do not invent a completely unfamiliar navigation paradigm.

Environmental innovation should happen **after destination selection**, not inside basic search behavior.

---

# 15. Screen 02 — Route Comparison

This is the most important product screen.

The user must understand three things immediately:

### Which route is recommended?

### How much longer will it take?

### Why is it more comfortable?

Example:

```text
────────────────────

Comfort
14 min
0.8 mi

Recommended

+2 min

38% less wind
22% more sunlight

────────────────────
```

Fastest:

```text
Fastest

12 min
0.7 mi

More exposed to wind
```

Context route:

```text
Stay Warm

15 min
0.9 mi

48% less wind
31% more sun
```

---

# 16. Route Explanation

Every recommended route should answer:

> Why?

Not through AI-generated paragraphs.

Instead provide 1–3 concrete reasons.

Examples:

```text
38% less wind

Mostly shaded

54% less rain exposure

Avoids icy incline

More sunlight

Lower heat exposure
```

The user should understand the reason within approximately two seconds.

---

# 17. Time Tradeoff

One of the most important visual comparisons:

```text
+2 min

38% less wind
```

ComfortOS succeeds when users can make an informed tradeoff between:

**time**

and

**comfort**

The design should visually pair those quantities.

---

# 18. Route Visualization

Routes should remain easy to distinguish.

Recommended Comfort Route should have the strongest hierarchy.

Fastest route should remain visible but secondary.

Environmental route segments may contain subtle contextual information.

Example conceptual visualization:

```text
Comfort route
━━━━━━━━━━━━━━━━

Fast route
──────────────

high exposure
//////

protected area
████
```

Do not make the map visually chaotic.

---

# 19. Active Navigation

During walking, UI must simplify considerably.

Primary information:

```text
Turn right on Oak St

300 ft
```

Secondary environmental information:

```text
Wind protection ahead
```

or:

```text
Shade begins in 2 min
```

or:

```text
Heavy rain exposure ahead
```

Never interrupt normal navigation instructions with excessive environmental analytics.

---

# 20. Microclimate Guidance During Navigation

This is an important differentiator.

Examples:

```text
Wind shelter ahead
```

```text
Sunny section for the next 4 min
```

```text
Covered walkway begins ahead
```

```text
High heat exposure for 0.2 mi
```

These notices should be short.

---

# 21. Screen 03 — Future Departure

ComfortOS is predictive.

Users should be able to change:

```text
Leave now
```

to:

```text
3:30 PM
4:00 PM
5:00 PM
```

When departure time changes:

- shade should change
- temperature may change
- rain probability may change
- wind may change
- route recommendation may change

This interaction should feel immediate.

---

# 22. Future Comparison

Example:

```text
Leave now

Comfort 58
14 min


Leave at 5:20 PM

Comfort 76
14 min

Cooler
More shade
Less wind
```

Potential user-facing insight:

```text
Better in 35 minutes
```

Do not make predictive routing feel like a complex forecasting tool.

---

# 23. Predictive Recommendation

Example:

```text
Walking later?

5:20 PM is expected to be
more comfortable.

+14 Comfort
```

This can become an important signature feature.

---

# 24. Screen 04 — Environment Layers

Layers should be available for exploration.

Potential menu:

```text
Comfort

Sun & Shade

Wind

Rain

Heat

Air
```

Snow appears where relevant.

No need to show irrelevant modes.

Example:

Phoenix July:

```text
Comfort
Shade
Heat
UV
```

Seattle November:

```text
Comfort
Rain
Wind
```

Minneapolis January:

```text
Comfort
Wind
Cold
Snow
```

---

# 25. City-Aware Design

The interface should adapt without completely changing its visual identity.

Same design system.

Different environmental emphasis.

The application should visually feel like the same product in:

- Phoenix
- Seattle
- Minneapolis
- Miami
- Chicago
- Denver

The city should affect content, not redesign the entire application.

---

# 26. Environmental Context Header

Potential component:

```text
Minneapolis

18°F
Feels 4°F

Windy & Cold

Stay Warm routes prioritized
```

Seattle:

```text
Seattle

48°F

Rain

Stay Dry routes prioritized
```

Phoenix:

```text
Phoenix

108°F

Extreme heat

Shade prioritized
```

---

# 27. Contextual Language

Avoid technical language when possible.

Bad:

```text
High solar radiation exposure
```

Better:

```text
Strong sun exposure
```

Bad:

```text
Reduced aerodynamic pedestrian exposure
```

Better:

```text
Less wind
```

Bad:

```text
Precipitation exposure coefficient
```

Better:

```text
Less time in rain
```

---

# 28. Advanced Information

Technical users may open additional details.

Example:

```text
Why this route?
```

↓

```text
Estimated shade
72%

Estimated wind exposure
31%

Rain exposure
0%

Comfort model confidence
High
```

Sources:

```text
Weather
NWS

Street network
OpenStreetMap

Building model
...
```

This is secondary UI.

---

# 29. Confidence Visualization

ComfortOS estimates microclimate conditions.

Therefore uncertainty should exist in the design system.

Possible labels:

```text
High confidence

Medium confidence

Limited data
```

Avoid fake precision.

For example:

Bad:

```text
Wind reduction: 43.783%
```

Good:

```text
~44% less wind exposure
```

---

# 30. Design Hierarchy

Information priority:

## Level 1

Destination

Recommended route

Travel time

## Level 2

Why recommended

Comfort difference

Current condition

## Level 3

Environmental components

Shade

Wind

Rain

Temperature

## Level 4

Raw data

Confidence

Source

Model details

The user must never be forced into Level 4 information.

---

# 31. Design Style

ComfortOS should feel:

### Clean

Avoid visual clutter.

### Spatial

The map is the central product surface.

### Natural

Environmental information should feel integrated with geography.

### Premium

Not like an experimental university GIS tool.

### Calm

Avoid aggressive warning colors everywhere.

### Trustworthy

Data values should feel measured, not decorative.

---

# 32. Visual Identity Direction

Explore visual directions around:

- atmosphere
- weather
- environmental gradients
- landscape
- air
- sunlight
- spatial movement

Avoid cliché visual identities based exclusively on:

- leaf logos
- sun icons
- clouds
- map pins

The brand should not look like a generic weather company.

---

# 33. Color System Philosophy

Environmental colors can be contextual.

Examples conceptually:

comfortable

cool

warm

rain

wind

danger

However, do not rely solely on color.

Accessibility must be considered.

Use:

- line patterns
- icons
- labels
- opacity
- texture

where appropriate.

---

# 34. Dark Mode

Design both:

Light Mode

and

Dark Mode.

Dark mode is especially important for nighttime walking.

Environmental overlays must remain readable in both.

---

# 35. Typography

Typography should prioritize:

- readability
- numbers
- travel time
- environmental differences

Numbers such as:

```text
14 min

38%

108°F
```

are important design elements.

Avoid overly decorative typography.

---

# 36. Bottom Sheet Interaction

Mobile route exploration should favor map + bottom-sheet architecture.

Example:

```text
MAP
MAP
MAP

──────────────

Comfort
14 min
Recommended

38% less wind

[ Start ]

──────────────
```

Swipe upward:

more details.

Swipe downward:

more map.

---

# 37. Mobile First

The core consumer product is mobile-first.

Design target:

iPhone first.

But components should be reusable in:

- Android
- web
- B2B dashboard

Desktop should not dictate mobile layout.

---

# 38. Accessibility

Minimum requirements:

- readable font sizes
- adequate contrast
- large touch targets
- screen-reader compatible route descriptions
- do not communicate environmental state with color only

Wheelchair navigation is a product feature, but the UI itself must also be accessible.

---

# 39. Profile Design

Do not ask users medical questions.

Possible preference controls:

```text
I prefer:

More shade

Less wind

Less rain

Fewer hills
```

Or simple profiles:

```text
Everyday

Heat sensitive

Cold sensitive

Wheelchair

Dog walk

Running
```

Advanced personalization comes later.

---

# 40. Personalization Must Remain Optional

A first-time user should get useful routes without creating an account.

No mandatory onboarding questionnaire.

No mandatory sign-up before route search.

Anonymous usefulness first.

---

# 41. First-Time Experience

First launch should teach the product through use.

Potential first message:

```text
Routes that feel better outside.

ComfortOS considers weather,
sun, wind, and your surroundings
to find more comfortable walks.
```

Then immediately:

```text
[ Explore Map ]
```

Avoid multi-page onboarding.

---

# 42. Notifications

Potential future notification:

```text
Your afternoon walk looks better at 5:30 PM.

Less heat
More shade
```

But notifications are not part of initial design priority.

---

# 43. Weather Alerts

Official severe weather should override normal comfort messaging.

Example:

```text
⚠ Heat Advisory

National Weather Service

Outdoor exposure may be dangerous.
```

Do not convert serious government alerts into playful comfort scores.

---

# 44. Safety Priority

When environmental conditions are potentially dangerous, the interface changes hierarchy.

Normally:

```text
Comfort Route
```

During official warning:

```text
Weather Alert

Heat Advisory

View safer options
```

Safety > comfort optimization.

---

# 45. Example Scenario A

## Minneapolis Winter

Design this scenario first.

Location:

Minneapolis, MN

Condition:

```text
18°F

Feels like 4°F

Sunny

NW wind 17 mph
```

Origin:

University of Minnesota

Destination:

Coffee shop approximately 10 minutes away.

Route options:

```text
Fastest
8 min

Comfort
10 min
Recommended

31% less wind
22% more sun

Stay Warm
11 min

48% less wind
35% more sun
```

Map should visually communicate wind exposure and building shelter without looking technical.

---

# 46. Example Scenario B

## Seattle Rain

Condition:

```text
48°F

Rain

SW wind 9 mph
```

Routes:

```text
Fastest
11 min

Comfort
13 min

Stay Dry
14 min

57% less rain exposure
```

Environmental map emphasis changes from wind/sun to rain protection.

The basic interface does NOT change.

---

# 47. Example Scenario C

## Phoenix Summer

Condition:

```text
108°F

Sunny

UV 10
```

Routes:

```text
Fastest
12 min

Comfort
14 min
Recommended

Stay Cool
15 min

62% less direct sun
```

Map emphasis:

shade + heat.

Again, same application architecture.

---

# 48. Multi-City Design Validation

Before approving the design system, test every major screen using:

### Minneapolis winter

### Seattle rain

### Phoenix summer

If a component only works for one city, redesign it.

This is mandatory.

---

# 49. Design Components

Claude Design should develop reusable components including:

```text
SearchBar

EnvironmentSummary

ComfortScore

RouteCard

RouteComparison

ContextRouteBadge

EnvironmentalMetric

LayerSelector

PredictionTimeSelector

OfficialAlert

MapLegend

SegmentDetail

NavigationInstruction

EnvironmentInsight
```

These should belong to a consistent design system.

---

# 50. Route Card

RouteCard is one of the most important components.

Required states:

```text
Fastest

Recommended Comfort

Context Route

Selected

Unselected

Active Navigation
```

Every RouteCard must display:

- route name
- travel time
- distance

Comfort routes may additionally display:

- comfort benefit
- environmental reasoning

---

# 51. Recommendation Badge

Recommended should be visible but subtle.

Avoid:

```text
🔥 BEST ROUTE!!!
```

Prefer:

```text
Recommended
```

ComfortOS should feel confident, not promotional.

---

# 52. Environment Insight Component

Example:

```text
Why this route?

Less wind
38%

More sunlight
22%
```

Seattle:

```text
Why this route?

Less rain exposure
57%
```

Phoenix:

```text
Why this route?

More shade
62%
```

Component structure stays identical.

---

# 53. Product Personality

ComfortOS should communicate:

"We understand what it feels like outside."

Not:

"We have lots of environmental data."

This distinction should guide every design decision.

---

# 54. Avoid Dashboard Syndrome

Do not turn the mobile app into cards displaying:

```text
Temperature
Humidity
Wind
UV
AQI
Pollen
Rain
Snow
Pressure
Visibility
```

That is a weather dashboard.

The main product is **movement through space**.

Environmental metrics support navigation.

---

# 55. Avoid Map Clutter

Do not simultaneously render:

- building polygons
- tree canopy polygons
- wind arrows
- shadow polygons
- AQI grid
- rain overlay
- comfort overlay
- three routes

to ordinary users.

Raw environmental visualization belongs in development/debug or advanced mode.

---

# 56. Developer / Debug Mode

Separate consumer UI from development visualization.

Debug mode may show:

```text
Building footprint

Shadow polygon

Wind vectors

Edge IDs

Comfort raw cost

Graph nodes

Confidence
```

Consumer interface must not.

This is important for Codex implementation.

---

# 57. AI Role in Product UI

AI should explain, not pretend to calculate environmental physics.

Potential AI text:

```text
This route is slightly longer,
but most of it is protected from
today's northwest wind.
```

AI receives deterministic engine output.

Never allow AI to invent:

- temperatures
- percentages
- route duration
- weather conditions
- exposure estimates

---

# 58. Predictive AI Insight

Future example:

```text
Better later

At 5:20 PM this route is expected
to have more shade and lower heat exposure.
```

Again:

numbers come from engine.

Language comes from AI.

---

# 59. Empty / Missing Data States

If high-quality data does not exist:

Do not fake UI precision.

Example:

```text
Wind shelter data is limited in this area.
```

The system can still provide:

```text
Fastest
Comfort
```

with available factors.

---

# 60. Offline / API Failure

Navigation should degrade gracefully.

Possible state:

```text
Live environmental data unavailable.

Showing standard walking route.
```

Never block basic navigation because a comfort provider failed.

---

# 61. Design Deliverables Required From Claude Design

Claude Design should not immediately generate production code.

First produce:

### A. Product UX Architecture

Overall navigation and screen relationships.

### B. Information Architecture

What information appears on each screen.

### C. Wireframes

Low-fidelity major screens.

### D. Visual Direction

Typography, surfaces, spacing, map treatment, environmental visual language.

### E. Component System

Reusable component definitions.

### F. Multi-City Variants

Minneapolis

Seattle

Phoenix

### G. High-Fidelity Prototype

Only after A–F are internally coherent.

---

# 62. Required Screens for First Design Round

Create high-fidelity concepts for:

1. Home Map
2. Search
3. Route Comparison — Minneapolis
4. Active Navigation — Minneapolis
5. Comfort Map
6. Future Departure
7. Seattle Rain variation
8. Phoenix Heat variation

Do NOT spend first-round effort on:

- account creation
- billing
- subscriptions
- social sharing
- settings depth
- B2B analytics

---

# 63. Design Evaluation Checklist

Before approving any design ask:

### Can a new user understand the product within five seconds?

### Is the map still the primary surface?

### Is the recommended route obvious?

### Can the user understand why the route is recommended?

### Is the time tradeoff obvious?

### Does the same design work in Minneapolis, Seattle, and Phoenix?

### Does it feel different from a standard weather app?

### Does it feel different from a standard Google Maps clone?

### Are technical details hidden until requested?

### Is uncertainty handled honestly?

If multiple answers are No, redesign.

---

# 64. Prototype Behavior

The prototype should demonstrate dynamic behavior.

When switching:

```text
Minneapolis
→
Seattle
→
Phoenix
```

the following should update:

- environmental summary
- contextual route
- map overlay
- route reasons
- recommendation language

while the design system remains consistent.

---

# 65. Suggested Prototype Dataset

Use realistic-looking MOCK DATA ONLY for design prototypes.

Every mocked value must be clearly identifiable in the codebase as mock data.

Do not present prototype values as live data.

Suggested:

### Minneapolis

```text
18°F
Feels 4°F
NW 17 mph

Fastest 8 min

Comfort 10 min
31% less wind
22% more sun

Stay Warm 11 min
48% less wind
35% more sun
```

### Seattle

```text
48°F
Rain
SW 9 mph

Fastest 11 min

Comfort 13 min

Stay Dry 14 min
57% less rain exposure
```

### Phoenix

```text
108°F
Sunny
UV 10

Fastest 12 min

Comfort 14 min

Stay Cool 15 min
62% less direct sun
```

---

# 66. Design Handoff to Codex

After the design is finalized, Claude should document each screen and component in implementation-ready terms.

For each component define:

```text
Component Name

Purpose

Required Props

Optional Props

States

Interactions

Responsive behavior

Accessibility requirements
```

Example:

```text
RouteCard

Props:

routeType
durationMinutes
distanceMiles
isRecommended
benefits[]
comfortScore
selected

States:

default
selected
active
disabled
```

Codex should implement from this contract rather than visually guessing.

---

# 67. Design Tokens

When the visual system is approved, create a token layer.

Example structure:

```text
spacing

radius

typography

surface

text

border

semantic environment states

map route styles

elevation
```

Avoid one-off styling throughout the application.

---

# 68. Semantic Design Tokens

Prefer semantic names.

Good:

```text
route-recommended

route-fast

environment-warning

environment-comfortable

surface-primary
```

Avoid coupling logic to visual names such as:

```text
greenRoute

blueCard
```

The visual palette may change later.

---

# 69. Product Naming

"ComfortOS" is currently an internal project codename.

Do not force the public brand name into the visual identity yet.

Claude Design may explore brand directions, but UI architecture should work independently from the final product name.

---

# 70. Long-Term Design Vision

ComfortOS should eventually make a city feel like a dynamic environmental surface.

The user should be able to understand:

> This block is hotter.

> This street is protected from wind.

> This side of the neighborhood is shaded.

> This route keeps me out of the rain.

without needing to understand GIS or meteorology.

The long-term visual metaphor is:

**A city that reveals how it feels.**

---

# 71. Final Design Principle

Whenever a design decision is uncertain, ask:

> Does this help the user choose a more comfortable way to move through the city?

If yes:

keep exploring it.

If no:

it is probably secondary.

---

# 72. Claude Design Instruction

When using this document with Claude Design:

1. Read `ARCHITECTURE_SPEC_V1.md` first for product and technical constraints.
2. Read this document completely before proposing visual design.
3. Do not immediately generate production code.
4. First define UX architecture.
5. Then create wireframes.
6. Then create a reusable design system.
7. Validate the same system against Minneapolis winter, Seattle rain, and Phoenix heat.
8. Only then create the high-fidelity application prototype.
9. Maintain mobile-first design.
10. Do not simplify ComfortOS into a shade-routing application.

The final design should make the following idea immediately understandable:

> The fastest route is not always the best route outside.