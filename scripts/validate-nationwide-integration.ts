import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";
import { ComfortRouteComparisonService } from "@/lib/comfort-routing/service";
import { createConfiguredBuildingProvider } from "@/lib/environment/buildings/providers/configuredBuildingProvider";
import { createConfiguredCoveredFeatureProvider } from "@/lib/environment/coveredFeatures/providers/configuredCoveredFeatureProvider";
import { ShadeAnalysisService } from "@/lib/environment/shade/service";
import { WindAnalysisService } from "@/lib/environment/wind/windService";
import { CompositeCandidateGenerator } from "@/lib/routing/generators/compositeCandidateGenerator";
import { CorridorWaypointGenerator } from "@/lib/routing/generators/corridorWaypointGenerator";
import { ProviderAlternativeGenerator } from "@/lib/routing/generators/providerAlternativeGenerator";
import { createConfiguredRoutingProvider } from "@/lib/routing/providers/configuredRoutingProvider";
import { RoutingService } from "@/lib/routing/service";
import { NwsWeatherProvider } from "@/lib/weather/providers/nwsWeatherProvider";
import { WeatherService } from "@/lib/weather/service";
import { loadNationwideWeatherScenarios } from "@/scripts/validate-nationwide-weather";

type IntegrationRow = {
  code: string;
  state: string;
  fixtureId: string;
  success: boolean;
  accepted: boolean;
  attempts: number;
  elapsedMs: number;
  candidateCount: number;
  analyzedCandidateCount: number;
  comparableCandidateCount: number;
  snowAnalysisCount: number;
  buildingQuerySucceeded: boolean;
  buildingRegion: string | null;
  buildingDatasetVersion: string | null;
  buildingCapability: string | null;
  routingProvider: string | null;
  routingMode: string | null;
  routingProductionEligible: boolean;
  managedRoutingRequests: number;
  context: string | null;
  failures: string[];
  error?: string;
};

const EXPECTED_RELEASE = "2026-08-19.0";
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_RETRIES = 1;
const REQUEST_TIMEOUT_MS = 60_000;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const envFile = options.envFile ?? ".env.local";
  if (existsSync(envFile)) loadEnvFile(envFile);
  const fixtureRoot = path.resolve(options.fixtureRoot ?? "fixtures/routes");
  const output = path.resolve(
    options.output ?? "/tmp/comfortos-nationwide-integration-validation.json",
  );
  const concurrency = positiveInteger(options.concurrency, DEFAULT_CONCURRENCY);
  const retries = positiveInteger(options.retries, DEFAULT_RETRIES);
  const expectedRelease = options.release ?? EXPECTED_RELEASE;
  const scenarios = await loadNationwideWeatherScenarios(fixtureRoot);
  const { service, routingMetadata, buildingProviderMode } = createService();
  const departureTime = new Date().toISOString();
  const rows = await mapWithConcurrency(scenarios, concurrency, async (scenario) => {
    const row = await validateScenario({
      service,
      scenario,
      departureTime,
      expectedRelease,
      retries,
    });
    console.error(
      `${row.accepted ? "PASS" : "FAIL"} ${row.code} ${row.state} (${row.elapsedMs} ms, ${row.managedRoutingRequests} routing requests)`,
    );
    return row;
  });
  const failures = rows.filter((row) => !row.accepted);
  const report = {
    format: "comfortos-nationwide-live-integration-v1",
    createdAt: new Date().toISOString(),
    departureTime,
    expectedRelease,
    routingProvider: routingMetadata,
    buildingProviderMode,
    generationPolicy: {
      maxCandidateAttempts: 1,
      maxConcurrentCandidateRequests: 1,
      maxEnvironmentAnalyzedCandidates: 2,
    },
    summary: {
      jurisdictionCount: rows.length,
      passedCount: rows.length - failures.length,
      failedCount: failures.length,
      accepted:
        rows.length === 51 &&
        failures.length === 0 &&
        routingMetadata.mode === "managed" &&
        routingMetadata.productionEligible,
      totalManagedRoutingRequests: rows.reduce(
        (total, row) => total + row.managedRoutingRequests,
        0,
      ),
      totalCandidates: rows.reduce((total, row) => total + row.candidateCount, 0),
      totalAnalyzedCandidates: rows.reduce(
        (total, row) => total + row.analyzedCandidateCount,
        0,
      ),
      totalSnowAnalyzedCandidates: rows.reduce(
        (total, row) => total + row.snowAnalysisCount,
        0,
      ),
      totalComparableCandidates: rows.reduce(
        (total, row) => total + row.comparableCandidateCount,
        0,
      ),
      maximumElapsedMs: Math.max(...rows.map((row) => row.elapsedMs)),
      averageElapsedMs: average(rows.map((row) => row.elapsedMs)),
      failedJurisdictions: failures.map((row) => ({
        code: row.code,
        state: row.state,
        failures: row.failures,
        error: row.error,
      })),
    },
    rows,
  };
  await writeJsonAtomic(output, report);
  console.log(JSON.stringify({ ...report, rows: undefined, output }, null, 2));
  if (!report.summary.accepted) process.exitCode = 1;
}

function createService() {
  const { provider: routingProvider, metadata: routingMetadata } =
    createConfiguredRoutingProvider();
  const { provider: buildingProvider, mode: buildingProviderMode } =
    createConfiguredBuildingProvider();
  const { provider: coveredFeatureProvider, mode: coveredFeatureProviderMode } =
    createConfiguredCoveredFeatureProvider();
  const routingService = new RoutingService(routingProvider);
  const weatherService = new WeatherService(
    new NwsWeatherProvider({
      baseUrl: process.env.WEATHER_BASE_URL,
      userAgent: process.env.WEATHER_USER_AGENT,
    }),
  );
  const service = new ComfortRouteComparisonService(
    routingService,
    new CompositeCandidateGenerator([
      new ProviderAlternativeGenerator(routingService),
      new CorridorWaypointGenerator(routingService),
    ]),
    weatherService,
    buildingProvider,
    new ShadeAnalysisService(buildingProvider),
    new WindAnalysisService(buildingProvider, weatherService),
    undefined,
    buildingProviderMode,
    coveredFeatureProvider,
    coveredFeatureProviderMode,
  );
  return { service, routingMetadata, buildingProviderMode };
}

async function validateScenario({
  service,
  scenario,
  departureTime,
  expectedRelease,
  retries,
}: {
  service: ComfortRouteComparisonService;
  scenario: Awaited<ReturnType<typeof loadNationwideWeatherScenarios>>[number];
  departureTime: string;
  expectedRelease: string;
  retries: number;
}): Promise<IntegrationRow> {
  const startedAt = performance.now();
  let attempts = 0;
  let lastError: unknown;

  while (attempts <= retries) {
    attempts += 1;
    try {
      const comparison = await service.compareWalkingRoutes(
        {
          origin: scenario.coordinate,
          destination: scenario.destination,
          departureTime,
          generationMode: "enhanced",
          includeEnvironmentalDebug: false,
          generationPolicy: {
            maxCandidateAttempts: 1,
            maxConcurrentCandidateRequests: 1,
            maxEnvironmentAnalyzedCandidates: 2,
          },
        },
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );
      const analyzed = comparison.candidates.filter(
        (candidate) => candidate.status === "complete",
      );
      const comparable = analyzed.filter(
        (candidate) =>
          candidate.comfortAnalysis?.routeComfortCost.comparable === true,
      );
      const snowAnalysisCount = analyzed.filter(
        (candidate) => candidate.snowAnalysis?.status === "available",
      ).length;
      const buildings = comparison.debug.buildings;
      const routing = comparison.debug.routingProvider;
      const checks = {
        candidateAvailable: comparison.candidates.length > 0,
        analyzedCandidateAvailable: analyzed.length > 0,
        comparableCandidateAvailable: comparable.length > 0,
        snowAnalysisComplete: snowAnalysisCount === analyzed.length,
        buildingQuerySucceeded: buildings?.querySucceeded === true,
        buildingRegionSupported:
          Boolean(buildings?.region) && buildings?.region !== "unsupported",
        buildingReleaseCurrent: buildings?.datasetVersion === expectedRelease,
        buildingCapabilityReady:
          comparison.debug.capabilities?.buildings === "ready",
        managedRouting:
          routing?.mode === "managed" && routing.productionEligible === true,
        routingRequestRecorded:
          (comparison.debug.routingUsage?.totalRequests ?? 0) >= 1,
      };
      const failures = Object.entries(checks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name);
      const row: IntegrationRow = {
        code: scenario.code,
        state: scenario.state,
        fixtureId: scenario.fixtureId,
        success: true,
        accepted: failures.length === 0,
        attempts,
        elapsedMs: Math.round(performance.now() - startedAt),
        candidateCount: comparison.candidates.length,
        analyzedCandidateCount: analyzed.length,
        comparableCandidateCount: comparable.length,
        snowAnalysisCount,
        buildingQuerySucceeded: buildings?.querySucceeded ?? false,
        buildingRegion: buildings?.region ?? null,
        buildingDatasetVersion: buildings?.datasetVersion ?? null,
        buildingCapability: comparison.debug.capabilities?.buildings ?? null,
        routingProvider: routing?.id ?? null,
        routingMode: routing?.mode ?? null,
        routingProductionEligible: routing?.productionEligible ?? false,
        managedRoutingRequests: comparison.debug.routingUsage?.totalRequests ?? 0,
        context: comparison.debug.context?.context ?? null,
        failures,
      };
      if (row.accepted || attempts > retries) return row;
      lastError = new Error(failures.join("; "));
    } catch (error) {
      lastError = error;
      if (attempts > retries) break;
    }
    await delay(500 * 2 ** (attempts - 1));
  }

  return {
    code: scenario.code,
    state: scenario.state,
    fixtureId: scenario.fixtureId,
    success: false,
    accepted: false,
    attempts,
    elapsedMs: Math.round(performance.now() - startedAt),
    candidateCount: 0,
    analyzedCandidateCount: 0,
    comparableCandidateCount: 0,
    snowAnalysisCount: 0,
    buildingQuerySucceeded: false,
    buildingRegion: null,
    buildingDatasetVersion: null,
    buildingCapability: null,
    routingProvider: null,
    routingMode: null,
    routingProductionEligible: false,
    managedRoutingRequests: 0,
    context: null,
    failures: ["comparisonRequest"],
    error: lastError instanceof Error ? lastError.message : "Integration failed.",
  };
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

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
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
      error instanceof Error
        ? error.message
        : "Nationwide integration validation failed.",
    );
    process.exitCode = 1;
  });
}
