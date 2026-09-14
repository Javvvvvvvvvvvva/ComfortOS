import assert from "node:assert/strict";
import test from "node:test";
import type { Coordinate } from "@/lib/geo/types";
import {
  normalizeNwsAlertResponse,
  normalizeNwsHourlyForecastResponse,
  normalizeNwsObservationResponse,
  normalizeNwsPointResponse,
  NwsWeatherProvider,
} from "@/lib/weather/providers/nwsWeatherProvider";
import { selectComfortWeatherForTime } from "@/lib/comfort/context";
import {
  selectWeatherCoordinate,
  weatherBundleMatchesCoordinate,
} from "@/lib/weather/location";
import {
  resolveCoordinateScopedWeather,
  WeatherService,
} from "@/lib/weather/service";
import type { WeatherBundle, WeatherProvider } from "@/lib/weather/types";
import {
  directionToDegrees,
  fahrenheitToCelsius,
  mphToMps,
  parseSpeedToMps,
} from "@/lib/weather/units";

const MINNEAPOLIS: Coordinate = { latitude: 44.9778, longitude: -93.265 };

test("normalizes weather units and wind directions", () => {
  assert.equal(Math.round(fahrenheitToCelsius(68) ?? 0), 20);
  assert.equal(Math.round((mphToMps(10) ?? 0) * 100) / 100, 4.47);
  assert.equal(Math.round((parseSpeedToMps("10 to 20 mph") ?? 0) * 100) / 100, 6.71);
  assert.equal(directionToDegrees("WNW"), 292.5);
});

test("normalizes NWS point metadata", () => {
  const point = normalizeNwsPointResponse({
    properties: {
      forecastHourly: "https://api.weather.gov/gridpoints/MPX/107,71/forecast/hourly",
      forecastGridData: "https://api.weather.gov/gridpoints/MPX/107,71",
      observationStations: "https://api.weather.gov/gridpoints/MPX/107,71/stations",
    },
  });

  assert.match(point.forecastHourly, /forecast\/hourly/);
  assert.match(point.forecastGridData ?? "", /gridpoints\/MPX/);
  assert.match(point.observationStations, /stations/);
});

test("normalizes latest station observations with nullable fields", () => {
  const snapshot = normalizeNwsObservationResponse({
    properties: {
      timestamp: "2026-08-08T12:10:00-05:00",
      temperature: { value: 23.2, unitCode: "wmoUnit:degC" },
      heatIndex: { value: null, unitCode: "wmoUnit:degC" },
      windChill: { value: 20.1, unitCode: "wmoUnit:degC" },
      dewpoint: { value: 12.3, unitCode: "wmoUnit:degC" },
      cloudLayers: [{ amount: "BKN", base: { value: 1200 } }],
      relativeHumidity: { value: 54 },
      windSpeed: { value: 4.5, unitCode: "wmoUnit:m_s-1" },
      windDirection: { value: 370, unitCode: "wmoUnit:degree_(angle)" },
      windGust: { value: null, unitCode: "wmoUnit:m_s-1" },
      precipitationLastHour: { value: 0.001, unitCode: "wmoUnit:m" },
      visibility: { value: 16093, unitCode: "wmoUnit:m" },
      textDescription: "Partly Cloudy",
    },
  });

  assert.equal(snapshot.timestamp, "2026-08-08T17:10:00.000Z");
  assert.equal(snapshot.temperatureC, 23.2);
  assert.equal(snapshot.apparentTemperatureC, 20.1);
  assert.equal(snapshot.windChillC, 20.1);
  assert.equal(snapshot.heatIndexC, null);
  assert.equal(snapshot.apparentTemperatureSource, "wind-chill");
  assert.equal(snapshot.dewPointC, 12.3);
  assert.equal(snapshot.cloudCover, 75);
  assert.equal(snapshot.windDirectionDeg, 10);
  assert.equal(snapshot.precipitationMmPerHour, 1);
  assert.equal(snapshot.windGustMps, null);
  assert.equal(snapshot.source, "National Weather Service");
});

test("normalizes NWS observation wind quantities to meters per second", () => {
  const snapshot = normalizeNwsObservationResponse({
    properties: {
      timestamp: "2026-08-08T12:10:00-05:00",
      temperature: { value: 23.2, unitCode: "wmoUnit:degC" },
      heatIndex: { value: null, unitCode: "wmoUnit:degC" },
      windChill: { value: null, unitCode: "wmoUnit:degC" },
      relativeHumidity: { value: 54 },
      windSpeed: { value: 18, unitCode: "wmoUnit:km_h-1" },
      windDirection: { value: 270, unitCode: "wmoUnit:degree_(angle)" },
      windGust: { value: 20, unitCode: "wmoUnit:mi_h-1" },
      precipitationLastHour: { value: null, unitCode: "wmoUnit:m" },
      visibility: { value: 16093, unitCode: "wmoUnit:m" },
      textDescription: "Partly Cloudy",
    },
  });

  assert.equal(snapshot.windSpeedMps, 5);
  assert.equal(Math.round((snapshot.windGustMps ?? 0) * 100) / 100, 8.94);
});

test("normalizes NWS hourly forecast periods", () => {
  const forecast = normalizeNwsHourlyForecastResponse(
    {
      properties: {
        periods: [
          {
            startTime: "2026-08-08T13:00:00-05:00",
            temperature: 80,
            temperatureUnit: "F",
            relativeHumidity: { value: 61 },
            windSpeed: "6 mph",
            windDirection: "NW",
            probabilityOfPrecipitation: { value: 20 },
            quantitativePrecipitation: { value: 0.002, unitCode: "wmoUnit:m" },
            shortForecast: "Mostly Sunny",
          },
        ],
      },
    },
    {
      properties: {
        dewpoint: {
          uom: "wmoUnit:degC",
          values: [{ validTime: "2026-08-08T18:00:00Z/PT1H", value: 18 }],
        },
        skyCover: {
          uom: "wmoUnit:percent",
          values: [{ validTime: "2026-08-08T18:00:00Z/PT1H", value: 72 }],
        },
        quantitativePrecipitation: {
          uom: "wmoUnit:mm",
          values: [{ validTime: "2026-08-08T18:00:00Z/PT4H", value: 8 }],
        },
        snowfallAmount: {
          uom: "wmoUnit:mm",
          values: [{ validTime: "2026-08-08T18:00:00Z/PT4H", value: 20 }],
        },
        iceAccumulation: {
          uom: "wmoUnit:mm",
          values: [{ validTime: "2026-08-08T18:00:00Z/PT4H", value: 0 }],
        },
        weather: {
          values: [
            {
              validTime: "2026-08-08T18:00:00Z/PT4H",
              value: [{ weather: "snow", intensity: "moderate" }],
            },
          ],
        },
      },
    },
  );

  assert.equal(forecast.length, 1);
  assert.equal(Math.round(forecast[0].temperatureC ?? 0), 27);
  assert.equal(forecast[0].windDirectionDeg, 315);
  assert.equal(Math.round((forecast[0].windSpeedMps ?? 0) * 100) / 100, 2.68);
  assert.equal(forecast[0].precipitationProbability, 20);
  assert.equal(forecast[0].precipitationMmPerHour, 2);
  assert.equal(forecast[0].dewPointC, 18);
  assert.equal(forecast[0].cloudCover, 72);
  assert.equal(forecast[0].snowfallMmPerHour, 5);
  assert.equal(forecast[0].iceAccumulationMmPerHour, 0);
  assert.equal(forecast[0].precipitationType, "snow");
});

test("normalizes active alerts", () => {
  const alerts = normalizeNwsAlertResponse({
    features: [
      {
        id: "urn:oid:alert-1",
        properties: {
          event: "Heat Advisory",
          severity: "Moderate",
          urgency: "Expected",
          certainty: "Likely",
          headline: "Heat Advisory issued August 8",
          description: "Hot conditions expected.",
          instruction: "Drink water.",
          effective: "2026-08-08T09:00:00-05:00",
          expires: "2026-08-08T20:00:00-05:00",
        },
      },
    ],
  });

  assert.equal(alerts[0].id, "urn:oid:alert-1");
  assert.equal(alerts[0].event, "Heat Advisory");
  assert.equal(alerts[0].effective, "2026-08-08T14:00:00.000Z");
  assert.equal(alerts[0].source, "National Weather Service");
});

test("selects weather location by origin, current location, then no location", () => {
  const origin = { latitude: 47.6062, longitude: -122.3321 };
  const currentLocation = { latitude: 33.4484, longitude: -112.074 };

  assert.deepEqual(
    selectWeatherCoordinate({ selectedOrigin: origin, currentLocation }),
    origin,
  );
  assert.deepEqual(selectWeatherCoordinate({ currentLocation }), currentLocation);
  assert.equal(selectWeatherCoordinate({}), null);
});

test("weather bundles are scoped to the requested user location", async () => {
  const seattle = { latitude: 47.6062, longitude: -122.3321 };
  const phoenix = { latitude: 33.4484, longitude: -112.074 };
  const supplied = weatherBundleAt(seattle, 12);
  let fetchedCoordinate: Coordinate | null = null;
  const weatherService = {
    async getWeatherBundle(coordinate: Coordinate) {
      fetchedCoordinate = coordinate;
      return weatherBundleAt(coordinate, 38);
    },
  };

  assert.equal(weatherBundleMatchesCoordinate(seattle, { ...seattle, latitude: 47.607 }), true);
  assert.equal(weatherBundleMatchesCoordinate(seattle, phoenix), false);

  const resolved = await resolveCoordinateScopedWeather(
    weatherService,
    phoenix,
    supplied,
  );
  assert.equal(resolved.source, "provider-fetch");
  assert.equal(resolved.suppliedBundleAccepted, false);
  assert.deepEqual(fetchedCoordinate, phoenix);
  assert.equal(resolved.bundle.current?.temperatureC, 38);
});

test("current observations win near departure and forecasts interpolate circular wind", () => {
  const bundle = weatherBundleAt(MINNEAPOLIS, 5);
  bundle.current = {
    timestamp: "2026-08-08T18:00:00.000Z",
    temperatureC: 5,
    relativeHumidity: 80,
    source: "test",
    confidence: 0.9,
  };
  bundle.hourlyForecast = [
    {
      timestamp: "2026-08-08T18:00:00.000Z",
      temperatureC: 8,
      cloudCover: 80,
      windSpeedMps: 2,
      windDirectionDeg: 350,
    },
    {
      timestamp: "2026-08-08T19:00:00.000Z",
      temperatureC: 10,
      cloudCover: 60,
      windSpeedMps: 4,
      windDirectionDeg: 10,
    },
  ];

  const nearCurrent = selectComfortWeatherForTime(
    bundle,
    "2026-08-08T18:20:00.000Z",
  );
  assert.equal(nearCurrent.selectionMethod, "current");
  assert.equal(nearCurrent.temperatureC, 5);
  assert.ok((nearCurrent.cloudCover ?? 0) > 70);

  const forecast = selectComfortWeatherForTime(
    { ...bundle, current: null },
    "2026-08-08T18:30:00.000Z",
  );
  assert.equal(forecast.selectionMethod, "interpolated-hourly");
  assert.ok(Math.abs(forecast.regionalWindDirectionDeg ?? 360) < 0.001);
  assert.equal(forecast.cloudCover, 70);
});

test("rejects malformed provider responses", () => {
  assert.throws(
    () => normalizeNwsPointResponse({ properties: { forecastHourly: "" } }),
    /Malformed NWS point response/,
  );
  assert.throws(
    () => normalizeNwsHourlyForecastResponse({ properties: { periods: [] } }),
    /Malformed NWS hourly forecast response/,
  );
  assert.throws(
    () =>
      normalizeNwsObservationResponse({
        properties: { temperature: { value: 20 } },
      }),
    /Malformed NWS timestamp/,
  );
});

test("NWS provider follows point, station, and observation links", async () => {
  const requestedUrls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url.endsWith("/points/44.9778,-93.2650")) {
      return jsonResponse({
        properties: {
          forecastHourly: "https://api.weather.gov/gridpoints/MPX/107,71/forecast/hourly",
          observationStations: "https://api.weather.gov/gridpoints/MPX/107,71/stations",
        },
      });
    }

    if (url.endsWith("/stations")) {
      return jsonResponse({
        features: [{ id: "https://api.weather.gov/stations/KMSP" }],
      });
    }

    if (url.endsWith("/stations/KMSP/observations/latest")) {
      return jsonResponse({
        properties: {
          timestamp: "2026-08-08T12:10:00-05:00",
          temperature: { value: 23 },
          textDescription: "Clear",
        },
      });
    }

    throw new Error(`Unexpected URL ${url}`);
  };
  const provider = new NwsWeatherProvider({ fetcher });
  const snapshot = await provider.getCurrentWeather(MINNEAPOLIS);

  assert.equal(snapshot.shortCondition, "Clear");
  assert.deepEqual(requestedUrls, [
    "https://api.weather.gov/points/44.9778,-93.2650",
    "https://api.weather.gov/gridpoints/MPX/107,71/stations",
    "https://api.weather.gov/stations/KMSP/observations/latest",
  ]);
});

test("weather service tolerates alert failures when conditions load", async () => {
  const provider: WeatherProvider = {
    async getCurrentWeather() {
      return {
        timestamp: "2026-08-08T17:10:00.000Z",
        temperatureC: 22,
        source: "test",
      };
    },
    async getHourlyForecast() {
      return [];
    },
    async getActiveAlerts() {
      throw new Error("alert failure");
    },
  };

  const bundle = await new WeatherService(provider).getWeatherBundle(MINNEAPOLIS);
  assert.equal(bundle.current?.temperatureC, 22);
  assert.deepEqual(bundle.alerts, []);
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/geo+json" },
  });
}

function weatherBundleAt(coordinate: Coordinate, temperatureC: number): WeatherBundle {
  return {
    coordinate,
    current: {
      timestamp: "2026-08-08T18:00:00.000Z",
      temperatureC,
      source: "test",
    },
    hourlyForecast: [],
    alerts: [],
    source: "test",
    updatedAt: "2026-08-08T18:00:00.000Z",
  };
}
