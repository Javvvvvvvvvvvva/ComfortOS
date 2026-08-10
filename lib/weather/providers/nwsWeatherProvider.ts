import type { Coordinate } from "@/lib/geo/types";
import {
  fahrenheitToCelsius,
  directionToDegrees,
  parseSpeedToMps,
} from "@/lib/weather/units";
import type {
  WeatherAlert,
  WeatherForecastPoint,
  WeatherProvider,
  WeatherSnapshot,
} from "@/lib/weather/types";

const DEFAULT_BASE_URL = "https://api.weather.gov";
const DEFAULT_USER_AGENT =
  "ComfortOS Stage 1 (contact: replace-with-project-contact)";
const REQUEST_TIMEOUT_MS = 10000;
const POINT_METADATA_TTL_MS = 5 * 60 * 1000;
const WEATHER_SOURCE = "National Weather Service";

type JsonRecord = Record<string, unknown>;

type NwsProviderOptions = {
  baseUrl?: string;
  userAgent?: string;
  fetcher?: typeof fetch;
};

type NwsPointMetadata = {
  forecastHourly: string;
  observationStations: string;
};

export class NwsWeatherProvider implements WeatherProvider {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly fetcher: typeof fetch;
  private readonly pointMetadataCache = new Map<
    string,
    { expiresAt: number; promise: Promise<NwsPointMetadata> }
  >();

  constructor(options: NwsProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.fetcher = options.fetcher ?? fetch;
  }

  async getCurrentWeather(coordinate: Coordinate): Promise<WeatherSnapshot> {
    const point = await this.getPointMetadata(coordinate);
    const stationUrl = await this.getNearestStationUrl(point.observationStations);
    const response = await this.fetchJson(`${stationUrl}/observations/latest`);
    return normalizeNwsObservationResponse(response);
  }

  async getHourlyForecast(coordinate: Coordinate): Promise<WeatherForecastPoint[]> {
    const point = await this.getPointMetadata(coordinate);
    const response = await this.fetchJson(point.forecastHourly);
    return normalizeNwsHourlyForecastResponse(response);
  }

  async getActiveAlerts(coordinate: Coordinate): Promise<WeatherAlert[]> {
    const lat = coordinate.latitude.toFixed(4);
    const lon = coordinate.longitude.toFixed(4);
    const response = await this.fetchJson(`/alerts/active?point=${lat},${lon}`);
    return normalizeNwsAlertResponse(response);
  }

  private async getPointMetadata(coordinate: Coordinate) {
    const lat = coordinate.latitude.toFixed(4);
    const lon = coordinate.longitude.toFixed(4);
    const key = `${lat},${lon}`;
    const cached = this.pointMetadataCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;

    const promise = this.fetchJson(`/points/${key}`).then(normalizeNwsPointResponse);
    this.pointMetadataCache.set(key, {
      expiresAt: Date.now() + POINT_METADATA_TTL_MS,
      promise,
    });

    try {
      return await promise;
    } catch (error) {
      this.pointMetadataCache.delete(key);
      throw error;
    }
  }

  private async getNearestStationUrl(stationsUrl: string) {
    const response = await this.fetchJson(stationsUrl);
    const features = getArray(getRecord(response).features);
    const firstStation = getRecord(features[0]);
    const stationId = asString(firstStation.id);

    if (!stationId) throw new Error("Live conditions unavailable.");
    return stationId;
  }

  private async fetchJson(pathOrUrl: string) {
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${this.baseUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.fetcher(url, {
        headers: {
          accept: "application/geo+json",
          "user-agent": this.userAgent,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "Live conditions unavailable for this location."
            : "Live conditions unavailable.",
        );
      }

      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof Error && error.message.includes("location")) throw error;
      throw new Error("Live conditions unavailable.");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function normalizeNwsPointResponse(response: unknown): NwsPointMetadata {
  const properties = getRecord(getRecord(response).properties);
  const forecastHourly = asString(properties.forecastHourly);
  const observationStations = asString(properties.observationStations);

  if (!forecastHourly || !observationStations) {
    throw new Error("Malformed NWS point response.");
  }

  return { forecastHourly, observationStations };
}

export function normalizeNwsObservationResponse(response: unknown): WeatherSnapshot {
  const properties = getRecord(getRecord(response).properties);
  const timestamp = normalizeIsoTimestamp(properties.timestamp);
  const temperatureC = quantityValue(properties.temperature);

  return {
    timestamp,
    temperatureC,
    apparentTemperatureC:
      quantityValue(properties.heatIndex) ?? quantityValue(properties.windChill),
    relativeHumidity: quantityValue(properties.relativeHumidity),
    windSpeedMps: quantityValue(properties.windSpeed),
    windDirectionDeg: normalizeDegrees(quantityValue(properties.windDirection)),
    windGustMps: quantityValue(properties.windGust),
    precipitationProbability: null,
    precipitationMmPerHour: quantityValueToMillimeters(properties.precipitationLastHour),
    visibilityMeters: quantityValue(properties.visibility),
    shortCondition: asString(properties.textDescription) ?? undefined,
    source: WEATHER_SOURCE,
    confidence: 0.75,
  };
}

export function normalizeNwsHourlyForecastResponse(
  response: unknown,
): WeatherForecastPoint[] {
  const properties = getRecord(getRecord(response).properties);
  const periods = getArray(properties.periods);

  if (!periods.length) throw new Error("Malformed NWS hourly forecast response.");

  return periods.map((period) => {
    const item = getRecord(period);
    return {
      timestamp: normalizeIsoTimestamp(item.startTime),
      temperatureC: normalizeForecastTemperature(item.temperature, item.temperatureUnit),
      apparentTemperatureC: null,
      relativeHumidity: quantityValue(item.relativeHumidity),
      windSpeedMps: parseSpeedToMps(item.windSpeed),
      windDirectionDeg: directionToDegrees(item.windDirection),
      precipitationProbability: quantityValue(item.probabilityOfPrecipitation),
      shortCondition: asString(item.shortForecast) ?? undefined,
    };
  });
}

export function normalizeNwsAlertResponse(response: unknown): WeatherAlert[] {
  const features = getArray(getRecord(response).features);

  return features.map((feature, index) => {
    const item = getRecord(feature);
    const properties = getRecord(item.properties);
    const id = asString(item.id) ?? asString(properties.id) ?? `nws-alert-${index}`;
    const event = asString(properties.event);

    if (!event) throw new Error("Malformed NWS alert response.");

    return {
      id,
      event,
      severity: asString(properties.severity) ?? undefined,
      urgency: asString(properties.urgency) ?? undefined,
      certainty: asString(properties.certainty) ?? undefined,
      headline: asString(properties.headline) ?? undefined,
      description: asString(properties.description) ?? undefined,
      instruction: asString(properties.instruction) ?? undefined,
      effective: normalizeOptionalIsoTimestamp(properties.effective),
      expires: normalizeOptionalIsoTimestamp(properties.expires),
      source: WEATHER_SOURCE,
    };
  });
}

function normalizeForecastTemperature(value: unknown, unit: unknown) {
  const numericValue = asNumber(value);
  if (numericValue === null) return null;

  const normalizedUnit = asString(unit)?.toUpperCase();
  if (normalizedUnit === "F") return fahrenheitToCelsius(numericValue);
  return numericValue;
}

function quantityValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const record = getRecordOrNull(value);
  return record ? asNumber(record.value) : null;
}

function quantityValueToMillimeters(value: unknown) {
  const record = getRecordOrNull(value);
  const numericValue = record ? asNumber(record.value) : asNumber(value);
  if (numericValue === null) return null;

  const unit = record ? asString(record.unitCode)?.toLowerCase() : undefined;
  if (!unit) return numericValue;
  if (unit.endsWith(":m")) return numericValue * 1000;
  if (unit.endsWith(":mm")) return numericValue;
  return numericValue;
}

function normalizeDegrees(value: number | null) {
  if (value === null) return null;
  return ((value % 360) + 360) % 360;
}

function normalizeIsoTimestamp(value: unknown) {
  const iso = normalizeOptionalIsoTimestamp(value);
  if (!iso) throw new Error("Malformed NWS timestamp.");
  return iso;
}

function normalizeOptionalIsoTimestamp(value: unknown) {
  const text = asString(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function getRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed NWS response.");
  }

  return value as JsonRecord;
}

function getRecordOrNull(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
