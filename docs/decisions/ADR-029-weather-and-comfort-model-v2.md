# ADR-029 — Weather And Comfort Model v2

Date: 2026-09-13
Status: Accepted

## Context

The first Comfort model preserved deterministic routing, but its normalized weather contract
exposed one ambiguous `apparentTemperatureC` value. A current NWS observation can populate that
value from either Heat Index or Wind Chill. Cold analysis then recalculated Wind Chill from that
already-derived value, while heat analysis could apply a humidity penalty after selecting an
already humidity-adjusted Heat Index. Both paths could count the same physical effect twice.

The heat model also used building shade and solar elevation without numeric cloud cover. A
client-supplied weather bundle could be reused after the origin changed because the comparison
service did not verify that the bundle coordinate matched the requested weather coordinate.

## Decision

### Normalized weather

Keep ambient and derived weather values separate:

```text
temperatureC
heatIndexC
windChillC
dewPointC
relativeHumidity
cloudCover
```

NWS station cloud layers are normalized to `0/25/50/75/100%` for
`CLR/FEW/SCT/BKN/OVC`. Hourly dew point and sky cover are merged from the linked NWS digital
forecast grid. Weather bundles record normalization version `nws-si-v2.0.0`, observation age,
station distance, and forecast humidity/cloud/wind coverage.

Current observations are eligible from 10 minutes before their timestamp through 45 minutes
after it. Otherwise, bounded hourly interpolation is used. Wind direction uses circular
interpolation across north instead of ordinary scalar interpolation.

### Cold pathway

Cold analysis always starts from ambient air temperature. Estimated pedestrian Wind Chill is
calculated once with local pedestrian wind:

```text
WCT = 13.12 + 0.6215T - 11.37V^0.16 + 0.3965TV^0.16
```

`T` is ambient Celsius and `V` is estimated pedestrian wind in km/h. A provider's already
derived apparent temperature is not fed back into this equation.

### Heat and humidity pathway

Use a valid provider Heat Index or calculate the NWS Heat Index once from ambient temperature
and relative humidity. For `T >= 80 F`, the fallback follows the NWS simple screening calculation
and Rothfusz regression, including the documented low- and high-humidity adjustments:

```text
simpleHI = 0.5 * (T + 61 + 1.2 * (T - 68) + 0.094 * RH)
screenedHI = (simpleHI + T) / 2

HI_F = -42.379 + 2.04901523T + 10.14333127RH
       - 0.22475541T*RH - 0.00683783T^2 - 0.05481717RH^2
       + 0.00122874T^2*RH + 0.00085282T*RH^2
       - 0.00000199T^2*RH^2

lowHumidityAdjustment = ((13 - RH) / 4) * sqrt((17 - abs(T - 95)) / 17)
highHumidityAdjustment = ((RH - 85) / 10) * ((87 - T) / 5)
```

`T` is degrees Fahrenheit and `RH` is percent. `screenedHI` is retained when it is below 80 F;
otherwise the Rothfusz result is used. The low-humidity subtraction applies for
`RH < 13%` and `80 <= T <= 112 F`; the high-humidity addition applies for `RH > 85%` and
`80 <= T <= 87 F`. Below the valid threshold, the engine retains ambient temperature instead of
inventing a Heat Index. The selected value is then decomposed, rather than duplicated, into
thermal cost:

```text
effectiveRatio = clamp((effectiveHeatTemperatureC - 26) / 17)
ambientRatio   = clamp((ambientTemperatureC - 26) / 17)
combinedThermalCost = 3.1 * effectiveRatio
ambientHeatCost = min(combinedThermalCost, 3.1 * ambientRatio)
humidityCost = combinedThermalCost - ambientHeatCost
```

Therefore:

```text
ambientHeatCost + humidityCost = combinedThermalCost
```

Humidity is visible as a contribution but cannot be added a second time.

### Solar and cloud pathway

Building shade remains geometric. Daytime heat solar exposure now includes cloud attenuation:

```text
directSunRatio = 1 - buildingShadeRatio
elevationModifier = clamp(sin(solarElevation) / sin(70 degrees))
cloudModifier = 1 - 0.75 * (cloudCover / 100)^3.4
solarCost = 2.2 * directSunRatio * elevationModifier * cloudModifier * effectiveRatio
```

The `0.25` overcast floor preserves diffuse radiation. This is a deterministic engineering
proxy, not measured irradiance, mean radiant temperature, WBGT, or a medical safety index.
The same `cloudModifier` attenuates the bounded winter direct-sun benefit, so an exposed route
under overcast skies cannot receive the same warming credit as an exposed route under clear skies.

### Location scope

A supplied weather bundle is accepted only when its coordinate is within 250 meters of the
requested weather coordinate. Otherwise the server fetches a new NWS bundle. Debug metadata
records whether the supplied bundle was accepted, but server logs continue to omit precise
coordinates.

The public comfort-comparison API does not accept browser-supplied weather as authoritative. It
overrides the weather coordinate with the route origin and performs a server-side NWS lookup.
Coordinate-scoped bundle injection remains available only at the internal service boundary for
deterministic controlled validation.

### Versioning

Comfort results record `comfort-v2.0.0`; heat results record `heat-v2.0.0`. Future coefficient
or formula changes require a new model version and regression evidence.

## Validation

- Deterministic tests prove generic apparent temperature cannot alter cold or heat results when
  the underlying ambient inputs are unchanged.
- Heat tests prove humidity increases exposure through Heat Index exactly once.
- Clear-sky and overcast tests prove cloud cover changes solar exposure without erasing diffuse
  exposure.
- Location tests prove a Seattle weather bundle cannot be reused for a Phoenix request.
- Live NWS validation passed Minneapolis, Seattle, and Phoenix with 156 forecast points per
  location and complete humidity, cloud, and wind forecast coverage.
- The live application passed nine-region routing integration with 35/35 comparable candidates,
  the pinned Overture building release, 45 managed Mapbox requests, and no public OSRM fallback.

## References

- [NWS API Web Service](https://www.weather.gov/documentation/services-web-api)
- [NWS Heat Index calculation](https://www.weather.gov/ctp/heat)
- [NWS Wind Chill formula and validity range](https://www.weather.gov/safety/cold-wind-chill-chart)

## Consequences

Comfort route comparisons are more internally consistent and auditable. The model remains a
relative route-exposure model. Field calibration, tree canopy, terrain, measured radiation,
surface temperature, and full outdoor thermal indices remain future work and cannot be implied
by the consumer score.
