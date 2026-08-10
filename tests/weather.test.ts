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
import { selectWeatherCoordinate } from "@/lib/weather/location";
import { WeatherService } from "@/lib/weather/service";
import type { WeatherProvider } from "@/lib/weather/types";
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
      observationStations: "https://api.weather.gov/gridpoints/MPX/107,71/stations",
    },
  });

  assert.match(point.forecastHourly, /forecast\/hourly/);
  assert.match(point.observationStations, /stations/);
});

test("normalizes latest station observations with nullable fields", () => {
  const snapshot = normalizeNwsObservationResponse({
    properties: {
      timestamp: "2026-08-08T12:10:00-05:00",
      temperature: { value: 23.2, unitCode: "wmoUnit:degC" },
      heatIndex: { value: null, unitCode: "wmoUnit:degC" },
      windChill: { value: 20.1, unitCode: "wmoUnit:degC" },
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
  assert.equal(snapshot.windDirectionDeg, 10);
  assert.equal(snapshot.precipitationMmPerHour, 1);
  assert.equal(snapshot.windGustMps, null);
  assert.equal(snapshot.source, "National Weather Service");
});

test("normalizes NWS hourly forecast periods", () => {
  const forecast = normalizeNwsHourlyForecastResponse({
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
          shortForecast: "Mostly Sunny",
        },
      ],
    },
  });

  assert.equal(forecast.length, 1);
  assert.equal(Math.round(forecast[0].temperatureC ?? 0), 27);
  assert.equal(forecast[0].windDirectionDeg, 315);
  assert.equal(Math.round((forecast[0].windSpeedMps ?? 0) * 100) / 100, 2.68);
  assert.equal(forecast[0].precipitationProbability, 20);
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

test("selects weather location by origin, current location, then fallback", () => {
  const origin = { latitude: 47.6062, longitude: -122.3321 };
  const currentLocation = { latitude: 33.4484, longitude: -112.074 };
  const fallback = { latitude: 44.9778, longitude: -93.265 };

  assert.deepEqual(
    selectWeatherCoordinate({ selectedOrigin: origin, currentLocation, fallback }),
    origin,
  );
  assert.deepEqual(
    selectWeatherCoordinate({ currentLocation, fallback }),
    currentLocation,
  );
  assert.deepEqual(selectWeatherCoordinate({ fallback }), fallback);
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
