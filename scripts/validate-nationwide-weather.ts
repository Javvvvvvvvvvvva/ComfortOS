import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";
import { decideRoutingContext } from "@/lib/comfort-routing/contextualMode";
import { selectComfortWeatherForTime } from "@/lib/comfort/context";
import type { Coordinate } from "@/lib/geo/types";
import { getUsStateCatalog, type UsJurisdiction } from "@/lib/regions/usStates";
import { WEATHER_NORMALIZATION_VERSION } from "@/lib/comfort/modelVersion";
import { isFrozenPrecipitation } from "@/lib/weather/precipitation";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";
import type { WeatherBundle, WeatherForecastPoint } from "@/lib/weather/types";

type RouteFixture = {
  id: string;
  label: string;
  origin: Coordinate;
  destination: Coordinate;
};

export type NationwideWeatherScenario = {
  code: string;
  state: string;
  fixtureId: string;
  label: string;
  coordinate: Coordinate;
  destination: Coordinate;
};

export type NationwideWeatherRow = {
  code: string;
  state: string;
  fixtureId: string;
  label: string;
  coordinate: Coordinate;
  passed: boolean;
  attempts: number;
  elapsedMs: number;
  forecastPointCount: number;
  selectionMethod: string;
  weatherContext: string | null;
  precipitationType: string | null;
  selectedSnowfallMmPerHour: number | null;
  selectedIceAccumulationMmPerHour: number | null;
  nearTermSnowfallCoverage: number;
  nearTermIceAccumulationCoverage: number;
  nearTermPrecipitationTypeCoverage: number;
  nearTermUsableWindVectorCoverage: number;
  snowfallCoverage: number;
  iceAccumulationCoverage: number;
  precipitationTypeCoverage: number;
  checks: Record<string, boolean>;
  failures: string[];
  error?: string;
};

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_RETRIES = 2;
const ROUTING_FORECAST_HORIZON_HOURS = 24;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (existsSync(options.envFile ?? ".env.local")) {
    loadEnvFile(options.envFile ?? ".env.local");
  }
  const fixtureRoot = path.resolve(options.fixtureRoot ?? "fixtures/routes");
  const output = path.resolve(
    options.output ?? "/tmp/comfortos-nationwide-weather-validation.json",
  );
  const concurrency = positiveInteger(options.concurrency, DEFAULT_CONCURRENCY);
  const retries = positiveInteger(options.retries, DEFAULT_RETRIES);
  const scenarios = await loadNationwideWeatherScenarios(fixtureRoot);
  const provider = new NwsWeatherProvider({
    baseUrl: process.env.WEATHER_BASE_URL,
    userAgent: process.env.WEATHER_USER_AGENT,
  });
  const service = new WeatherService(provider, 0);
  const checkedAt = new Date().toISOString();
  const rows = await mapWithConcurrency(scenarios, concurrency, async (scenario) => {
    const row = await validateScenario(service, scenario, checkedAt, retries);
    console.error(
      `${row.passed ? "PASS" : "FAIL"} ${row.code} ${row.state} (${row.forecastPointCount} forecast points)`,
    );
    return row;
  });
  const report = buildNationwideWeatherReport(rows, checkedAt);
  await writeJsonAtomic(output, report);
  console.log(JSON.stringify({ ...report, rows: undefined, output }, null, 2));
  if (!report.summary.accepted) process.exitCode = 1;
}

export async function loadNationwideWeatherScenarios(fixtureRoot: string) {
  const catalog = getUsStateCatalog();
  const filenames = await fs.readdir(fixtureRoot);
  const scenarios: NationwideWeatherScenario[] = [];

  for (const jurisdiction of catalog.jurisdictions) {
    const prefix =
      jurisdiction.code === "DC"
        ? "dc"
        : jurisdiction.name.toLowerCase().replaceAll(" ", "-");
    const matches = filenames.filter(
      (filename) =>
        filename.startsWith(`${prefix}-stage-10-`) &&
        filename.endsWith("-routes.json"),
    );
    if (matches.length !== 1) {
      throw new Error(
        `Expected one Stage 10 route fixture for ${jurisdiction.code}; found ${matches.length}.`,
      );
    }
    const routes = JSON.parse(
      await fs.readFile(path.join(fixtureRoot, matches[0]), "utf8"),
    ) as RouteFixture[];
    const route =
      routes.find((candidate) => /capitol|capital/i.test(`${candidate.id} ${candidate.label}`)) ??
      routes[0];
    if (!route || !validCoordinate(route.origin)) {
      throw new Error(`Missing representative route coordinate for ${jurisdiction.code}.`);
    }
    if (!withinJurisdictionBounds(route.origin, jurisdiction)) {
      throw new Error(`Representative coordinate is outside ${jurisdiction.code}.`);
    }
    scenarios.push({
      code: jurisdiction.code,
      state: jurisdiction.name,
      fixtureId: route.id,
      label: route.label,
      coordinate: route.origin,
      destination: route.destination,
    });
  }

  return scenarios;
}

async function validateScenario(
  service: WeatherService,
  scenario: NationwideWeatherScenario,
  atTime: string,
  retries: number,
): Promise<NationwideWeatherRow> {
  const startedAt = performance.now();
  let attempts = 0;
  let lastError: unknown;

  while (attempts <= retries) {
    attempts += 1;
    try {
      const bundle = await service.getWeatherBundle(scenario.coordinate);
      const row = evaluateBundle(scenario, bundle, atTime, attempts, startedAt);
      if (row.passed || attempts > retries) return row;
      lastError = new Error(row.failures.join("; "));
    } catch (error) {
      lastError = error;
      if (attempts > retries) break;
    }
    await delay(300 * 2 ** (attempts - 1));
  }

  return {
    ...scenario,
    passed: false,
    attempts,
    elapsedMs: Math.round(performance.now() - startedAt),
    forecastPointCount: 0,
    selectionMethod: "missing",
    weatherContext: null,
    precipitationType: null,
    selectedSnowfallMmPerHour: null,
    selectedIceAccumulationMmPerHour: null,
    nearTermSnowfallCoverage: 0,
    nearTermIceAccumulationCoverage: 0,
    nearTermPrecipitationTypeCoverage: 0,
    nearTermUsableWindVectorCoverage: 0,
    snowfallCoverage: 0,
    iceAccumulationCoverage: 0,
    precipitationTypeCoverage: 0,
    checks: {},
    failures: ["provider-request"],
    error: lastError instanceof Error ? lastError.message : "Weather validation failed.",
  };
}

function evaluateBundle(
  scenario: NationwideWeatherScenario,
  bundle: WeatherBundle,
  atTime: string,
  attempts: number,
  startedAt: number,
): NationwideWeatherRow {
  const selected = selectComfortWeatherForTime(bundle, atTime);
  const forecast = bundle.hourlyForecast;
  const nearTermForecast = forecast.slice(0, ROUTING_FORECAST_HORIZON_HOURS);
  const snowfallCoverage = coverage(forecast, (point) => point.snowfallMmPerHour);
  const iceAccumulationCoverage = coverage(
    forecast,
    (point) => point.iceAccumulationMmPerHour,
  );
  const precipitationTypeCoverage =
    forecast.length > 0
      ? forecast.filter((point) => point.precipitationType != null).length /
        forecast.length
      : 0;
  const nearTermSnowfallCoverage = coverage(
    nearTermForecast,
    (point) => point.snowfallMmPerHour,
  );
  const nearTermIceAccumulationCoverage = coverage(
    nearTermForecast,
    (point) => point.iceAccumulationMmPerHour,
  );
  const nearTermPrecipitationTypeCoverage =
    nearTermForecast.length > 0
      ? nearTermForecast.filter((point) => point.precipitationType != null).length /
        nearTermForecast.length
      : 0;
  const nearTermUsableWindVectorCoverage = usableWindVectorCoverage(
    nearTermForecast,
  );
  const activeFrozenPrecipitation =
    isFrozenPrecipitation(selected.precipitationType) &&
    ((selected.snowfallMmPerHour ?? 0) > 0 ||
      (selected.iceAccumulationMmPerHour ?? 0) > 0);
  const weatherContext = decideRoutingContext(bundle, {
    rainCapable: true,
    snowCapable: true,
    heatCapable: true,
    atTime,
  }).context;
  const checks = {
    normalizedContract:
      bundle.normalizationVersion === WEATHER_NORMALIZATION_VERSION,
    officialProvider: bundle.source === "National Weather Service",
    currentOrForecastAvailable:
      bundle.current !== null || forecast.length > 0,
    usableAtCurrentTime: selected.selectionMethod !== "missing",
    forecastAvailable: forecast.length >= 24,
    nearTermTemperatureCoverage:
      coverage(nearTermForecast, (point) => point.temperatureC) >= 0.9,
    nearTermHumidityCoverage:
      coverage(nearTermForecast, (point) => point.relativeHumidity) >= 0.9,
    nearTermWindVectorCoverage: nearTermUsableWindVectorCoverage >= 0.9,
    nearTermSnowfallCoverage: nearTermSnowfallCoverage >= 0.9,
    nearTermIceAccumulationCoverage:
      nearTermIceAccumulationCoverage >= 0.9,
    nearTermPrecipitationTypeCoverage:
      nearTermPrecipitationTypeCoverage >= 0.9,
    nonNegativeSnowAndIce: forecast.every(
      (point) =>
        nonNegativeOrMissing(point.snowfallMmPerHour) &&
        nonNegativeOrMissing(point.iceAccumulationMmPerHour),
    ),
    frozenPrecipitationRoutesAsSnow:
      !activeFrozenPrecipitation || weatherContext === "snow",
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  return {
    ...scenario,
    passed: failures.length === 0,
    attempts,
    elapsedMs: Math.round(performance.now() - startedAt),
    forecastPointCount: forecast.length,
    selectionMethod: selected.selectionMethod,
    weatherContext,
    precipitationType: selected.precipitationType ?? null,
    selectedSnowfallMmPerHour: finiteOrNull(selected.snowfallMmPerHour),
    selectedIceAccumulationMmPerHour: finiteOrNull(
      selected.iceAccumulationMmPerHour,
    ),
    nearTermSnowfallCoverage,
    nearTermIceAccumulationCoverage,
    nearTermPrecipitationTypeCoverage,
    nearTermUsableWindVectorCoverage,
    snowfallCoverage,
    iceAccumulationCoverage,
    precipitationTypeCoverage,
    checks,
    failures,
  };
}

export function buildNationwideWeatherReport(
  rows: NationwideWeatherRow[],
  checkedAt: string,
) {
  const failures = rows.filter((row) => !row.passed);
  return {
    format: "comfortos-nationwide-weather-snow-validation-v1",
    checkedAt,
    provider: "National Weather Service",
    normalizationVersion: WEATHER_NORMALIZATION_VERSION,
    summary: {
      jurisdictionCount: rows.length,
      passedCount: rows.length - failures.length,
      failedCount: failures.length,
      accepted: rows.length === 51 && failures.length === 0,
      totalForecastPointCount: rows.reduce(
        (total, row) => total + row.forecastPointCount,
        0,
      ),
      minimumForecastPointCount: minimum(rows.map((row) => row.forecastPointCount)),
      routingForecastHorizonHours: ROUTING_FORECAST_HORIZON_HOURS,
      minimumNearTermSnowfallCoverage: minimum(
        rows.map((row) => row.nearTermSnowfallCoverage),
      ),
      minimumNearTermIceAccumulationCoverage: minimum(
        rows.map((row) => row.nearTermIceAccumulationCoverage),
      ),
      minimumNearTermPrecipitationTypeCoverage: minimum(
        rows.map((row) => row.nearTermPrecipitationTypeCoverage),
      ),
      minimumNearTermUsableWindVectorCoverage: minimum(
        rows.map((row) => row.nearTermUsableWindVectorCoverage),
      ),
      minimumSnowfallCoverage: minimum(rows.map((row) => row.snowfallCoverage)),
      minimumIceAccumulationCoverage: minimum(
        rows.map((row) => row.iceAccumulationCoverage),
      ),
      minimumPrecipitationTypeCoverage: minimum(
        rows.map((row) => row.precipitationTypeCoverage),
      ),
      failedJurisdictions: failures.map((row) => ({
        code: row.code,
        state: row.state,
        failures: row.failures,
        error: row.error,
      })),
    },
    rows,
  };
}

function withinJurisdictionBounds(
  coordinate: Coordinate,
  jurisdiction: UsJurisdiction,
) {
  const [west, south, east, north] = jurisdiction.bbox;
  return (
    coordinate.latitude >= south &&
    coordinate.latitude <= north &&
    coordinate.longitude >= west &&
    coordinate.longitude <= east
  );
}

function validCoordinate(value: Coordinate | undefined): value is Coordinate {
  return Boolean(
    value &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude) &&
      value.latitude >= -90 &&
      value.latitude <= 90 &&
      value.longitude >= -180 &&
      value.longitude <= 180,
  );
}

function coverage(
  points: WeatherForecastPoint[],
  selector: (point: WeatherForecastPoint) => number | null | undefined,
) {
  if (points.length === 0) return 0;
  return (
    points.filter((point) => {
      const value = selector(point);
      return typeof value === "number" && Number.isFinite(value);
    }).length / points.length
  );
}

function nonNegativeOrMissing(value: number | null | undefined) {
  return value == null || (Number.isFinite(value) && value >= 0);
}

function usableWindVectorCoverage(points: WeatherForecastPoint[]) {
  if (points.length === 0) return 0;
  return (
    points.filter((point) => {
      const speed = point.windSpeedMps;
      if (typeof speed !== "number" || !Number.isFinite(speed)) return false;
      return speed <= 0.5 ||
        (typeof point.windDirectionDeg === "number" &&
          Number.isFinite(point.windDirectionDeg));
    }).length / points.length
  );
}

function finiteOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function minimum(values: number[]) {
  return values.length > 0 ? Math.min(...values) : 0;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseArgs(args: string[]) {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    }
    options[
      key.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
    ] = value;
  }
  return options;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Expected a positive integer.");
  }
  return parsed;
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.rm(temporaryPath, { force: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await fs.rename(temporaryPath, filePath);
}

const entrypoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === entrypoint) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Nationwide weather validation failed.",
    );
    process.exitCode = 1;
  });
}
