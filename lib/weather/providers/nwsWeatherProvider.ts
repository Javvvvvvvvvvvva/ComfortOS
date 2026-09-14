import type { Coordinate } from "@/lib/geo/types";
import { coordinateDistanceMeters } from "@/lib/weather/location";
import {
  fahrenheitToCelsius,
  directionToDegrees,
  kmhToMps,
  mphToMps,
  parseSpeedToMps,
} from "@/lib/weather/units";
import type {
  WeatherAlert,
  WeatherForecastPoint,
  WeatherProvider,
  WeatherSnapshot,
} from "@/lib/weather/types";
import { classifyPrecipitationType } from "@/lib/weather/precipitation";

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
  forecastGridData?: string;
  observationStations: string;
};

type NwsStation = {
  url: string;
  id?: string;
  coordinate?: Coordinate;
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
    const station = await this.getNearestStation(point.observationStations);
    const response = await this.fetchJson(`${station.url}/observations/latest`);
    return addObservationQuality(
      normalizeNwsObservationResponse(response),
      coordinate,
      station,
    );
  }

  async getHourlyForecast(coordinate: Coordinate): Promise<WeatherForecastPoint[]> {
    const point = await this.getPointMetadata(coordinate);
    const [hourlyResponse, gridResponse] = await Promise.all([
      this.fetchJson(point.forecastHourly),
      point.forecastGridData
        ? this.fetchJson(point.forecastGridData).catch(() => null)
        : Promise.resolve(null),
    ]);
    return normalizeNwsHourlyForecastResponse(hourlyResponse, gridResponse);
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

  private async getNearestStation(stationsUrl: string): Promise<NwsStation> {
    const response = await this.fetchJson(stationsUrl);
    const features = getArray(getRecord(response).features);
    const firstStation = getRecord(features[0]);
    const stationUrl = asString(firstStation.id);

    if (!stationUrl) throw new Error("Live conditions unavailable.");
    return {
      url: stationUrl,
      id: stationUrl.split("/").at(-1),
      coordinate: featureCoordinate(firstStation),
    };
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
  const forecastGridData = asString(properties.forecastGridData) ?? undefined;
  const observationStations = asString(properties.observationStations);

  if (!forecastHourly || !observationStations) {
    throw new Error("Malformed NWS point response.");
  }

  return { forecastHourly, forecastGridData, observationStations };
}

export function normalizeNwsObservationResponse(response: unknown): WeatherSnapshot {
  const properties = getRecord(getRecord(response).properties);
  const timestamp = normalizeIsoTimestamp(properties.timestamp);
  const temperatureC = quantityValue(properties.temperature);
  const heatIndexC = quantityValue(properties.heatIndex);
  const windChillC = quantityValue(properties.windChill);
  const apparentTemperatureC = heatIndexC ?? windChillC;
  const precipitationMmPerHour = quantityValueToMillimeters(
    properties.precipitationLastHour,
  );
  const shortCondition = asString(properties.textDescription) ?? undefined;

  return {
    timestamp,
    temperatureC,
    apparentTemperatureC,
    apparentTemperatureSource:
      heatIndexC !== null ? "heat-index" : windChillC !== null ? "wind-chill" : "none",
    heatIndexC,
    windChillC,
    dewPointC: quantityTemperatureC(properties.dewpoint),
    relativeHumidity: quantityValue(properties.relativeHumidity),
    windSpeedMps: quantitySpeedToMps(properties.windSpeed),
    windDirectionDeg: normalizeDegrees(quantityValue(properties.windDirection)),
    windGustMps: quantitySpeedToMps(properties.windGust),
    precipitationProbability: null,
    precipitationMmPerHour,
    snowfallMmPerHour: null,
    iceAccumulationMmPerHour: null,
    precipitationType: classifyPrecipitationType({
      condition: shortCondition,
      precipitationMmPerHour,
    }),
    cloudCover: cloudCoverFromLayers(properties.cloudLayers),
    visibilityMeters: quantityValue(properties.visibility),
    shortCondition,
    source: WEATHER_SOURCE,
    confidence: 0.75,
  };
}

export function normalizeNwsHourlyForecastResponse(
  response: unknown,
  gridResponse?: unknown,
): WeatherForecastPoint[] {
  const properties = getRecord(getRecord(response).properties);
  const periods = getArray(properties.periods);

  if (!periods.length) throw new Error("Malformed NWS hourly forecast response.");

  return periods.map((period) => {
    const item = getRecord(period);
    const timestamp = normalizeIsoTimestamp(item.startTime);
    const precipitationMmPerHour =
      quantityValueToMillimeters(item.quantitativePrecipitation) ??
      gridAccumulationRateForTime(
        gridResponse,
        "quantitativePrecipitation",
        timestamp,
      );
    const snowfallMmPerHour = gridAccumulationRateForTime(
      gridResponse,
      "snowfallAmount",
      timestamp,
    );
    const iceAccumulationMmPerHour = gridAccumulationRateForTime(
      gridResponse,
      "iceAccumulation",
      timestamp,
    );
    const shortCondition = asString(item.shortForecast) ?? undefined;
    const gridCondition = gridWeatherForTime(gridResponse, timestamp);
    return {
      timestamp,
      temperatureC: normalizeForecastTemperature(item.temperature, item.temperatureUnit),
      apparentTemperatureC: null,
      heatIndexC: null,
      windChillC: null,
      dewPointC:
        quantityTemperatureC(item.dewpoint) ??
        gridValueForTime(gridResponse, "dewpoint", timestamp, quantityTemperatureC),
      relativeHumidity: quantityValue(item.relativeHumidity),
      windSpeedMps: parseSpeedToMps(item.windSpeed),
      windDirectionDeg: directionToDegrees(item.windDirection),
      precipitationProbability: quantityValue(item.probabilityOfPrecipitation),
      precipitationMmPerHour,
      snowfallMmPerHour,
      iceAccumulationMmPerHour,
      precipitationType: classifyPrecipitationType({
        condition: [shortCondition, gridCondition].filter(Boolean).join(" "),
        precipitationMmPerHour,
        snowfallMmPerHour,
        iceAccumulationMmPerHour,
      }),
      cloudCover:
        normalizedPercent(quantityValue(item.skyCover)) ??
        gridValueForTime(gridResponse, "skyCover", timestamp, normalizedPercent),
      shortCondition,
    };
  });
}

function addObservationQuality(
  snapshot: WeatherSnapshot,
  requestedCoordinate: Coordinate,
  station: NwsStation,
): WeatherSnapshot {
  const ageMinutes = Math.max(0, (Date.now() - Date.parse(snapshot.timestamp)) / 60_000);
  const stationDistanceMeters = station.coordinate
    ? coordinateDistanceMeters(requestedCoordinate, station.coordinate)
    : null;
  const freshnessFactor = ageMinutes <= 20 ? 1 : ageMinutes <= 45 ? 0.82 : ageMinutes <= 90 ? 0.5 : 0.2;
  const distanceFactor =
    stationDistanceMeters === null
      ? 0.85
      : stationDistanceMeters <= 5_000
        ? 1
        : stationDistanceMeters <= 25_000
          ? 1 - ((stationDistanceMeters - 5_000) / 20_000) * 0.35
          : 0.55;

  return {
    ...snapshot,
    confidence: clamp01(0.85 * freshnessFactor * distanceFactor),
    observationStationId: station.id,
    observationStationDistanceMeters: stationDistanceMeters,
    observationAgeMinutes: ageMinutes,
  };
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

function quantityTemperatureC(value: unknown) {
  const record = getRecordOrNull(value);
  const numericValue = record ? asNumber(record.value) : asNumber(value);
  if (numericValue === null) return null;
  const unit = record ? asString(record.unitCode)?.toLowerCase() : undefined;
  if (unit?.includes("degf")) return fahrenheitToCelsius(numericValue);
  return numericValue;
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

function quantitySpeedToMps(value: unknown) {
  const record = getRecordOrNull(value);
  const numericValue = record ? asNumber(record.value) : asNumber(value);
  if (numericValue === null) return null;

  const unit = record ? asString(record.unitCode)?.toLowerCase() : undefined;
  if (!unit || /m_s-1|m\/s/.test(unit)) return numericValue;
  if (/km_h-1|km\/h|kph/.test(unit)) return kmhToMps(numericValue);
  if (/mi_h-1|mph/.test(unit)) return mphToMps(numericValue);
  return numericValue;
}

function normalizeDegrees(value: number | null) {
  if (value === null) return null;
  return ((value % 360) + 360) % 360;
}

function cloudCoverFromLayers(value: unknown) {
  const amounts: Record<string, number> = {
    CLR: 0,
    SKC: 0,
    FEW: 25,
    SCT: 50,
    BKN: 75,
    OVC: 100,
    VV: 100,
  };
  const layers = getArray(value);
  const cover = layers.reduce<number | null>((maximum, layer) => {
    const amount = asString(getRecord(layer).amount)?.toUpperCase();
    const mapped = amount ? amounts[amount] : undefined;
    if (mapped === undefined) return maximum;
    return maximum === null ? mapped : Math.max(maximum, mapped);
  }, null);
  return cover;
}

function featureCoordinate(feature: JsonRecord): Coordinate | undefined {
  const geometry = getRecordOrNull(feature.geometry);
  const coordinates = geometry ? getArray(geometry.coordinates) : [];
  const longitude = asNumber(coordinates[0]);
  const latitude = asNumber(coordinates[1]);
  return latitude === null || longitude === null ? undefined : { latitude, longitude };
}

function gridValueForTime(
  response: unknown,
  propertyName: string,
  timestamp: string,
  normalize: (value: unknown) => number | null,
) {
  const root = getRecordOrNull(response);
  const properties = root ? getRecordOrNull(root.properties) : null;
  const property = properties ? getRecordOrNull(properties[propertyName]) : null;
  const values = property ? getArray(property.values) : [];
  const target = Date.parse(timestamp);
  if (!Number.isFinite(target)) return null;

  for (const entryValue of values) {
    const entry = getRecord(entryValue);
    const interval = parseNwsValidTime(asString(entry.validTime));
    if (interval && target >= interval.start && target < interval.end) {
      return normalize({ value: entry.value, unitCode: property?.uom });
    }
  }
  return null;
}

function gridAccumulationRateForTime(
  response: unknown,
  propertyName: string,
  timestamp: string,
) {
  const match = gridEntryForTime(response, propertyName, timestamp);
  if (!match) return null;
  const amountMillimeters = quantityValueToMillimeters({
    value: match.entry.value,
    unitCode: match.property.uom,
  });
  const durationHours = (match.interval.end - match.interval.start) / 3_600_000;
  if (amountMillimeters === null || durationHours <= 0) return null;
  return Math.max(0, amountMillimeters / durationHours);
}

function gridWeatherForTime(response: unknown, timestamp: string) {
  const match = gridEntryForTime(response, "weather", timestamp);
  if (!match || !Array.isArray(match.entry.value)) return null;
  const values = match.entry.value
    .flatMap((item) => {
      const record = getRecordOrNull(item);
      const weather = record ? asString(record.weather) : null;
      return weather ? [weather.replaceAll("_", " ")] : [];
    });
  return values.length > 0 ? values.join(" ") : null;
}

function gridEntryForTime(
  response: unknown,
  propertyName: string,
  timestamp: string,
) {
  const root = getRecordOrNull(response);
  const properties = root ? getRecordOrNull(root.properties) : null;
  const property = properties ? getRecordOrNull(properties[propertyName]) : null;
  const values = property ? getArray(property.values) : [];
  const target = Date.parse(timestamp);
  if (!property || !Number.isFinite(target)) return null;

  for (const entryValue of values) {
    const entry = getRecord(entryValue);
    const interval = parseNwsValidTime(asString(entry.validTime));
    if (interval && target >= interval.start && target < interval.end) {
      return { property, entry, interval };
    }
  }
  return null;
}

function parseNwsValidTime(value: string | null) {
  if (!value) return null;
  const [startText, durationText] = value.split("/");
  const start = Date.parse(startText);
  const duration = parseIsoDurationMilliseconds(durationText);
  if (!Number.isFinite(start) || duration === null) return null;
  return { start, end: start + duration };
}

function parseIsoDurationMilliseconds(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match) return null;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  return (
    (Number(days) * 86_400 + Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds)) *
    1000
  );
}

function normalizedPercent(value: unknown) {
  const number = typeof value === "object" ? quantityValue(value) : asNumber(value);
  return number === null ? null : Math.max(0, Math.min(100, number));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
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
