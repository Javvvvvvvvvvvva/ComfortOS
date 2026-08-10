# ADR-003: Stage 1 Weather Provider

## Status

Accepted

## Context

Stage 1 needs real current and near-future outdoor atmospheric conditions for the active route context without starting shade analysis, wind shelter, Comfort routing, or Climate DNA. The weather foundation must keep provider response shapes out of React and expose normalized SI units to the rest of ComfortOS.

## Decision

ComfortOS will use the National Weather Service API as the Stage 1 weather provider for U.S. prototype coverage.

The provider adapter follows the NWS coordinate flow:

```text
/points/{lat},{lon}
```

The point response supplies linked hourly forecast and observation-station endpoints. The adapter follows those links for hourly forecast periods and nearest-station latest observations. Active alerts are requested with:

```text
/alerts/active?point={lat},{lon}
```

The application consumes only normalized models:

```text
WeatherSnapshot
WeatherForecastPoint
WeatherAlert
WeatherBundle
```

Weather location selection is selected origin first, browser current location second, and fallback coordinate third.

## Consequences

- NWS response structures remain behind `WeatherProvider`.
- Internal temperatures, wind speeds, precipitation, visibility, and timestamps are normalized before reaching UI code.
- The UI can display official live conditions and active alerts without introducing a Comfort Score.
- NWS is U.S.-focused; unsupported locations should fail gracefully with “Live conditions unavailable.”
- Provider failures must not block standard walking routing.
- Weather requests use a coordinate cache key rounded to three decimals and a five-minute in-memory TTL, with matching server cache headers for short-lived reuse.

## Non-Goals

- No pedestrian microclimate calculations.
- No shade, wind shelter, Comfort routing, Climate DNA, or environmental route weighting.
- No use of prototype weather mock values as live data.
