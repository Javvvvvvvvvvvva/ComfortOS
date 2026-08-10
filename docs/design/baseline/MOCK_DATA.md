# ComfortOS — Mock Data Inventory

THESE VALUES ARE DESIGN FIXTURES.

They exist only to drive the Claude Design prototype. They must not become production constants. Later they will be replaced with deterministic outputs from `WeatherProvider`, `ShadeEngine`, `WindEngine`, `RainEngine`, `SnowIceEngine`, `AirQualityEngine`, `ComfortEngine`, and `RoutingEngine`.

Source inspected:

```text
docs/design/baseline/source/latest/ComfortOS-Prototype-Round2.dc.html
```

## Scenario Fixtures

The prototype contains a static `CITY_DATA` object for exactly three preview scenarios:

- Minneapolis (`mn`): `Stay Warm`, layers `Comfort`, `Wind`, `Sun & Shelter`
- Seattle (`sea`): `Stay Dry`, layers `Comfort`, `Rain`, `Wind`
- Phoenix (`phx`): `Stay Cool`, layers `Comfort`, `Shade`, `Heat`

These cities are validation scenarios, not architectural limits.

## Weather And Condition Values

Owned later by: `WeatherProvider`, normalized `WeatherSnapshot`, city profile weighting.

- Minneapolis now: `18°F`, feels like `4°F`, `Cold & windy`, `NW wind 17 mph`
- Minneapolis +30: `20°F`, feels like `9°F`, `Calmer wind`, `NW wind 12 mph`
- Minneapolis +60: `21°F`, feels like `12°F`, `Mild wind`, `NW wind 8 mph`
- Seattle now: `48°F`, feels like `45°F`, `Rain`, `SW wind 9 mph`
- Seattle +30: `48°F`, feels like `46°F`, `Light rain`, `SW wind 7 mph`
- Seattle +60: `49°F`, feels like `47°F`, `Rain easing`, `SW wind 6 mph`
- Phoenix now: `108°F`, feels like `112°F`, `Extreme heat`, `UV 10`
- Phoenix +30: `107°F`, feels like `110°F`, `Extreme heat`, `UV 9`
- Phoenix +60: `103°F`, feels like `105°F`, `Sun lowering, still hot`, `UV 6`

## Comfort Scores And Prediction Text

Owned later by: `ComfortEngine`, `WeatherProvider`, environmental engines.

- Minneapolis comfort scores: `42`, `51`, `58`; prediction copy includes `+9 Comfort` and `+16 Comfort`
- Seattle comfort scores: `61`, `66`, `74`; prediction copy includes `+5 Comfort` and `+13 Comfort`
- Phoenix comfort scores: `33`, `36`, `44`; prediction copy includes `+3 Comfort` and `+11 Comfort`

Prediction labels are also mocked: Minneapolis `3:30 PM` / `4:00 PM`, Seattle `5:00 PM` / `5:30 PM`, Phoenix `7:30 PM` / `8:00 PM`.

## Route Fixtures

Owned later by: `RoutingEngine`, `ComfortEngine`, route explanation layer.

Routes are fixed to three options: `fastest`, `comfort`, `context`. Every route has mocked ETA, distance, and explanation text.

- Minneapolis: fastest `8 min` / `0.6 mi`; comfort `9-10 min` / `0.7 mi`; context `11-12 min` / `0.8 mi`
- Seattle: fastest `11 min` / `0.9 mi`; comfort `12-13 min` / `1.0 mi`; context `13-14 min` / `1.1 mi`
- Phoenix: fastest `12 min` / `1.0 mi`; comfort `13-14 min` / `1.1 mi`; context `14-15 min` / `1.2 mi`

Mock explanation values include:

- Minneapolis: `24-48% less wind exposure`, `15-35% more sunlight`
- Seattle: `24-62% less rain exposure`, `Mostly covered walkway`, `Covered most of the way`
- Phoenix: `18-64% less direct sun`, `Mostly shaded`, `Shaded the whole way`

## Environment Detail Fixtures

Owned later by: `ShadeEngine`, `WindEngine`, `RainEngine`, `ComfortEngine`.

The `detail` object provides mocked `shade`, `wind`, `rain`, and `confidence` values:

- Minneapolis: shade `52-58%`, wind `14-31%`, rain `0%`, confidence `High` or `Medium`
- Seattle: shade `20-25%`, wind `12-18%`, rain `20-70%`, confidence `High` or `Medium`
- Phoenix: shade `70-74%`, wind `8-10%`, rain `0%`, confidence `High` or `Medium`

## Map Segment Fixtures

Owned later by: `RoutingEngine`, `ShadeEngine`, `WindEngine`, `RainEngine`, heat/solar engines, normalized `EdgeEnvironment`.

The prototype defines 14 static segment geometries:

```text
Elm St, 2nd Ave, Riverside Dr, Market St, Chapel Row, Union Ave,
Garden Walk, Commerce St, Bridge Path, Willow Ln, Harbor Way,
Central Plaza, Cross St, Mill Row
```

Each city has arrays of 14 numeric layer scores. These are not real map data. They drive visual color, stroke width, halos, and exposed-segment dash textures.

## Navigation Fixtures

Owned later by: `RoutingEngine`, application navigation view model, microclimate guidance service.

The Active Navigation turn instruction is hardcoded:

```text
Turn right on Bridge Path
300 ft
```

Microclimate guidance is city-specific but static:

- Minneapolis: `Wind shelter in 300 ft`; `Protected for the next 6 min`
- Seattle: `Covered walkway in 2 min`; `Reduced rain exposure for the next 0.3 mi`
- Phoenix: `Shade begins in 2 min`; `Shaded for ~5 min · high sun exposure ahead`

Production must generate these from route progress and upcoming segment environments.
