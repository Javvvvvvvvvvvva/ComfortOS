# ComfortOS — Product Overview

ComfortOS is an outdoor comfort navigation platform for the United States.

Its core question:

> What is the most comfortable way for this person to walk to their destination at this time?

ComfortOS is not a weather application, a simple shaded-route application, a GIS dashboard, or a Google Maps clone. The product combines weather, forecast, sun position, urban geometry, pedestrian-network data, and city climate context so that route choice can be based on comfort cost, not only distance or travel time.

Core principle:

> Every city has a different definition of comfort.

The current prototype validates three climate archetypes:

- Minneapolis: cold, wind, snow -> Stay Warm / Sheltered
- Seattle: rain -> Stay Dry
- Phoenix: extreme heat, sun, UV -> Stay Cool

These are validation scenarios, not the permanent list of supported cities. The architecture must remain nationwide and extensible. City climate profiles provide prior knowledge, while current and forecast conditions decide the route.

Expected data flow:

```text
External/Public Data
        ↓
Provider Adapters
        ↓
Normalized Domain Models
        ↓
Environmental Engines
        ↓
Comfort Engine
        ↓
Routing Engine
        ↓
Application View Models
        ↓
UI Components
```

UI components consume application view models. Environmental physics, route scoring, weather normalization, and comfort calculations belong in deterministic engine layers, not in React/UI components.
