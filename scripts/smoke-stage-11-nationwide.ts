import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";
import type { ComfortRouteComparisonResult } from "@/lib/comfort-routing/types";
import type { Coordinate } from "@/lib/geo/types";

type NationwideSmokeScenario = {
  id: string;
  jurisdiction: string;
  origin: Coordinate;
  destination: Coordinate;
};

export type NationwideSmokeRow = {
  id: string;
  jurisdiction: string;
  success: boolean;
  status: number;
  elapsedMs: number;
  candidateCount: number;
  comparableCandidateCount: number;
  buildingQuerySucceeded: boolean;
  buildingRegion: string | null;
  buildingDatasetVersion: string | null;
  buildingCapability: string | null;
  routingProvider: string | null;
  routingMode: string | null;
  routingProductionEligible: boolean;
  managedRoutingRequests: number;
  error?: string;
};

const SCENARIOS: NationwideSmokeScenario[] = [
  {
    id: "minneapolis",
    jurisdiction: "MN",
    origin: { latitude: 44.9778, longitude: -93.265 },
    destination: { latitude: 44.9815, longitude: -93.2512 },
  },
  {
    id: "seattle",
    jurisdiction: "WA",
    origin: { latitude: 47.6097, longitude: -122.3425 },
    destination: { latitude: 47.6231, longitude: -122.3384 },
  },
  {
    id: "phoenix",
    jurisdiction: "AZ",
    origin: { latitude: 33.4533, longitude: -112.0738 },
    destination: { latitude: 33.4458, longitude: -112.0712 },
  },
  {
    id: "chicago",
    jurisdiction: "IL",
    origin: { latitude: 41.8765, longitude: -87.6315 },
    destination: { latitude: 41.881, longitude: -87.627 },
  },
  {
    id: "new-york",
    jurisdiction: "NY",
    origin: { latitude: 40.7105, longitude: -74.0085 },
    destination: { latitude: 40.7155, longitude: -74.003 },
  },
  {
    id: "miami",
    jurisdiction: "FL",
    origin: { latitude: 25.759, longitude: -80.195 },
    destination: { latitude: 25.7645, longitude: -80.189 },
  },
  {
    id: "anchorage",
    jurisdiction: "AK",
    origin: { latitude: 61.216, longitude: -149.903 },
    destination: { latitude: 61.2205, longitude: -149.8975 },
  },
  {
    id: "honolulu",
    jurisdiction: "HI",
    origin: { latitude: 21.304, longitude: -157.862 },
    destination: { latitude: 21.309, longitude: -157.855 },
  },
  {
    id: "washington-dc",
    jurisdiction: "DC",
    origin: { latitude: 38.896, longitude: -77.039 },
    destination: { latitude: 38.901, longitude: -77.034 },
  },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvironment(args.envFile);
  const baseUrl = normalizeBaseUrl(args.baseUrl ?? "http://127.0.0.1:3000");
  const expectedRelease = args.release ?? "2026-08-19.0";
  const timeoutMs = parsePositiveInteger(args.timeoutMs, 80_000);
  const secrets = responseSecrets();
  const health = await requestJson(
    `${baseUrl}/api/health/live`,
    process.env.HEALTHCHECK_TOKEN,
    Math.min(timeoutMs, 20_000),
    secrets,
  );
  const rows: NationwideSmokeRow[] = [];
  const departureTime = new Date().toISOString();

  for (const scenario of SCENARIOS) {
    const startedAt = performance.now();
    try {
      const response = await requestJson(
        `${baseUrl}/api/routes/comfort-comparison`,
        undefined,
        timeoutMs,
        secrets,
        {
          origin: scenario.origin,
          destination: scenario.destination,
          departureTime,
          generationMode: "enhanced",
          generationPolicy: {
            maxCandidateAttempts: 3,
            maxConcurrentCandidateRequests: 3,
            maxEnvironmentAnalyzedCandidates: 4,
          },
          includeEnvironmentalDebug: false,
        },
      );
      const comparison = (
        response.body as { comparison?: ComfortRouteComparisonResult }
      ).comparison;
      if (!response.ok || !comparison) {
        throw new Error(responseError(response));
      }

      const buildings = comparison.debug.buildings;
      const routing = comparison.debug.routingProvider;
      rows.push({
        id: scenario.id,
        jurisdiction: scenario.jurisdiction,
        success: true,
        status: response.status,
        elapsedMs: Math.round(performance.now() - startedAt),
        candidateCount: comparison.candidates.length,
        comparableCandidateCount: comparison.candidates.filter(
          (candidate) => candidate.comfortAnalysis?.routeComfortCost.comparable === true,
        ).length,
        buildingQuerySucceeded: buildings?.querySucceeded === true,
        buildingRegion: buildings?.region ?? null,
        buildingDatasetVersion: buildings?.datasetVersion ?? null,
        buildingCapability: comparison.debug.capabilities?.buildings ?? null,
        routingProvider: routing?.id ?? null,
        routingMode: routing?.mode ?? null,
        routingProductionEligible: routing?.productionEligible === true,
        managedRoutingRequests: comparison.debug.routingUsage?.totalRequests ?? 0,
      });
    } catch (error) {
      rows.push({
        id: scenario.id,
        jurisdiction: scenario.jurisdiction,
        success: false,
        status: 0,
        elapsedMs: Math.round(performance.now() - startedAt),
        candidateCount: 0,
        comparableCandidateCount: 0,
        buildingQuerySucceeded: false,
        buildingRegion: null,
        buildingDatasetVersion: null,
        buildingCapability: null,
        routingProvider: null,
        routingMode: null,
        routingProductionEligible: false,
        managedRoutingRequests: 0,
        error: error instanceof Error ? error.message : "Nationwide app smoke failed.",
      });
    }
  }

  const acceptance = evaluateNationwideAppSmoke({
    healthStatus: health.status,
    healthBody: health.body,
    expectedRelease,
    rows,
  });
  const report = {
    format: "comfortos-stage-11-nationwide-app-smoke-v1",
    createdAt: new Date().toISOString(),
    baseUrl,
    expectedRelease,
    health: health.body,
    summary: {
      scenarioCount: rows.length,
      successCount: rows.filter((row) => row.success).length,
      comparableRegionCount: rows.filter(
        (row) => row.comparableCandidateCount > 0,
      ).length,
      buildingReadyRegionCount: rows.filter(
        (row) => row.buildingQuerySucceeded && row.buildingCapability === "ready",
      ).length,
      managedRoutingRequestCount: rows.reduce(
        (sum, row) => sum + row.managedRoutingRequests,
        0,
      ),
      maximumElapsedMs: Math.max(...rows.map((row) => row.elapsedMs)),
      accepted: acceptance.accepted,
      failures: acceptance.failures,
    },
    rows,
  };

  if (args.output) await writeJsonAtomic(path.resolve(args.output), report);
  console.log(JSON.stringify(report, null, 2));
  if (!acceptance.accepted) process.exitCode = 1;
}

export function evaluateNationwideAppSmoke({
  healthStatus,
  healthBody,
  expectedRelease,
  rows,
}: {
  healthStatus: number;
  healthBody: Record<string, unknown>;
  expectedRelease: string;
  rows: NationwideSmokeRow[];
}) {
  const failures: string[] = [];
  const checks = asOptionalRecord(healthBody.checks);
  const routingHealth = asOptionalRecord(checks?.routing);
  const buildingHealth = asOptionalRecord(checks?.buildings);
  if (healthStatus !== 200 || healthBody.status !== "ready") {
    failures.push("Live app health is not ready.");
  }
  if (routingHealth?.ok !== true || routingHealth.mode !== "mapbox-managed") {
    failures.push("Managed Mapbox routing health did not pass.");
  }
  if (buildingHealth?.ok !== true) {
    failures.push("R2-backed building service health did not pass.");
  }
  if (rows.length !== SCENARIOS.length) {
    failures.push(`Expected ${SCENARIOS.length} representative regions.`);
  }

  for (const row of rows) {
    if (!row.success || row.status !== 200) {
      failures.push(`${row.id}: comfort comparison failed.`);
      continue;
    }
    if (!row.buildingQuerySucceeded || row.buildingRegion === "unsupported") {
      failures.push(`${row.id}: building coverage is unavailable.`);
    }
    if (row.buildingCapability !== "ready" || row.comparableCandidateCount < 1) {
      failures.push(`${row.id}: comfort candidates are not comparable.`);
    }
    if (row.buildingDatasetVersion !== expectedRelease) {
      failures.push(`${row.id}: building release does not match ${expectedRelease}.`);
    }
    if (row.routingMode !== "managed" || !row.routingProductionEligible) {
      failures.push(`${row.id}: routing provider is not managed production routing.`);
    }
    if (row.managedRoutingRequests < 1) {
      failures.push(`${row.id}: no managed routing request was recorded.`);
    }
  }

  return { accepted: failures.length === 0, failures };
}

async function requestJson(
  url: string,
  authorizationToken: string | undefined,
  timeoutMs: number,
  secrets: string[],
  body?: unknown,
) {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(authorizationToken
        ? { authorization: `Bearer ${authorizationToken}` }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (secrets.some((secret) => text.includes(secret))) {
    throw new Error("Application response exposed a configured credential.");
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Application returned non-JSON status ${response.status}.`);
  }
  return { ok: response.ok, status: response.status, body: payload };
}

function responseError(response: { status: number; body: Record<string, unknown> }) {
  const message =
    typeof response.body.error === "string" ? response.body.error : "unknown error";
  return `HTTP ${response.status}: ${message}`;
}

function responseSecrets() {
  return [
    process.env.MAPBOX_ACCESS_TOKEN,
    process.env.BUILDING_QUERY_SERVICE_TOKEN,
    process.env.HEALTHCHECK_TOKEN,
    process.env.ENVIRONMENT_QUERY_SERVICE_TOKEN,
    process.env.R2_RUNTIME_ACCESS_KEY_ID,
    process.env.R2_RUNTIME_SECRET_ACCESS_KEY,
    process.env.R2_SECRET_ACCESS_KEY,
  ].filter((value): value is string => Boolean(value && value.length >= 8));
}

async function loadEnvironment(explicitPath: string | undefined) {
  const envPath = path.resolve(explicitPath ?? ".env.local");
  try {
    await fs.access(envPath);
    loadEnvFile(envPath);
  } catch (error) {
    if (explicitPath || !isMissingFile(error)) throw error;
  }
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    throw new Error("Application URL must use HTTPS outside localhost.");
  }
  return url.toString().replace(/\/$/, "");
}

function asOptionalRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Expected a positive integer timeout.");
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

function isMissingFile(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Stage 11 smoke failed.");
    process.exitCode = 1;
  });
}
