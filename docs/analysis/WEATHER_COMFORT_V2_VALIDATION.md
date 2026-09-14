# Weather And Comfort v2 Validation

Date: 2026-09-13
Result: **PASSED FOR CONTINUED MODEL VALIDATION**

This result validates weather normalization, location scoping, and deterministic calculation
integrity. It does not approve the consumer production release or claim medical thermal safety.

## Live NWS Check

Command:

```bash
npm run weather:validate:live
```

| Location | Selection | Context | Temp | Humidity | Dew point | Cloud | Wind | Observation age | Station distance | Forecast points |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Minneapolis | current | balanced | 21 C | 30.5% | 3 C | 25% | 2.06 m/s | 25.8 min | 10.9 km | 156 |
| Seattle | current | balanced | 16 C | 82.4% | 13 C | 100% | 6.17 m/s | 20.8 min | 6.9 km | 156 |
| Phoenix | current | heat | 39 C | 29.5% | 18 C | 50% | 3.09 m/s | 20.8 min | 6.9 km | 156 |

All three locations passed current-time usability, temperature, humidity, wind, minimum forecast
length, and at least 90% hourly humidity/cloud/wind coverage. Actual forecast coverage was 100%
for all three factors at all three locations.

## Live Application Integration

The application was connected to the authenticated nationwide Cloudflare R2 environment
service and tested through `/api/routes/comfort-comparison` in nine representative regions.

| Gate | Result |
| --- | ---: |
| Application health | ready |
| Regions returning comparable routes | 9/9 |
| Comparable candidates | 35/35 |
| Regions with ready building data | 9/9 |
| Managed Mapbox routing requests | 45 |
| Public OSRM fallbacks | 0 |
| Maximum route-comparison latency | 3,896 ms |

Every building query returned Overture release `2026-08-19.0`. A separate authenticated R2
benchmark reported 51 jurisdictions, 20,758 stores, real buildings in all nine regions, and a
cold-query p95 of 1,799 ms. Phoenix selected the `heat` context from fresh origin-scoped weather;
weather debug reported complete humidity and cloud coverage, and the selected route was comparable
under `comfort-v2.0.0`.

## Deterministic Gates

- Ambient cold plus local pedestrian wind calculates Wind Chill once.
- NWS Heat Index includes humidity once; the engine only decomposes that combined thermal cost.
- Cloud cover attenuates daytime direct-sun cost.
- Cloud cover also attenuates winter direct-sun benefit.
- Current observations expire from route analysis after their bounded time window.
- Forecast wind direction interpolates correctly across 360/0 degrees.
- Weather bundles cannot cross between distant user locations.
- Public route requests cannot override server-fetched weather or move it away from route origin.
- Missing spatial analysis is reported as unknown distance independently from confidence.

## Remaining Scientific Limits

- NWS weather is regional, not a street sensor network.
- Cloud attenuation is a documented proxy rather than measured irradiance.
- Building shade excludes tree canopy and terrain.
- Urban wind remains a bounded heuristic rather than CFD or field measurement.
- Comfort weights still require field observations and blinded user-route comparisons before an
  absolute comfort claim is permitted.

## Official References

- [NWS API Web Service](https://www.weather.gov/documentation/services-web-api)
- [NWS Heat Index calculation](https://www.weather.gov/ctp/heat)
- [NWS Wind Chill formula and validity range](https://www.weather.gov/safety/cold-wind-chill-chart)
