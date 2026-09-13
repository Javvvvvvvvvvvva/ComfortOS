import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "node:process";

type Scenario = {
  id: string;
  jurisdiction: string;
  bbox: string;
};

const SCENARIOS: Scenario[] = [
  { id: "minneapolis", jurisdiction: "MN", bbox: "-93.268,44.976,-93.262,44.982" },
  { id: "seattle", jurisdiction: "WA", bbox: "-122.338,47.606,-122.331,47.612" },
  { id: "phoenix", jurisdiction: "AZ", bbox: "-112.078,33.445,-112.071,33.452" },
  { id: "chicago", jurisdiction: "IL", bbox: "-87.633,41.875,-87.626,41.882" },
  { id: "new-york", jurisdiction: "NY", bbox: "-74.010,40.709,-74.002,40.716" },
  { id: "miami", jurisdiction: "FL", bbox: "-80.196,25.758,-80.188,25.765" },
  { id: "anchorage", jurisdiction: "AK", bbox: "-149.905,61.215,-149.896,61.222" },
  { id: "honolulu", jurisdiction: "HI", bbox: "-157.863,21.303,-157.854,21.310" },
  { id: "washington-dc", jurisdiction: "DC", bbox: "-77.040,38.895,-77.033,38.902" },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvironment(args.envFile);
  const baseUrl = normalizeBaseUrl(
    args.url ?? requireEnvironment("ENVIRONMENT_QUERY_SERVICE_URL"),
  );
  const token =
    process.env.ENVIRONMENT_QUERY_SERVICE_TOKEN ??
    process.env.BUILDING_QUERY_SERVICE_TOKEN ??
    "";
  if (!token) throw new Error("ENVIRONMENT_QUERY_SERVICE_TOKEN is required.");
  const rounds = parsePositiveInteger(args.rounds, 3);
  const timeoutMs = parsePositiveInteger(args.timeoutMs, 30_000);
  const maximumP95Ms = parsePositiveNumber(args.maximumP95Ms, 8_000);

  const health = await requestJson(`${baseUrl}/health`, undefined, timeoutMs, token);
  if (health.status !== 200 || health.body.status !== "ready") {
    throw new Error("Environment service health check failed.");
  }
  const deployment = asRecord(health.body.deployment);
  if (deployment.jurisdictionCount !== 51) {
    throw new Error("Environment service does not report 51 active jurisdictions.");
  }

  const unauthorized = await requestJson(
    `${baseUrl}/metadata`,
    undefined,
    timeoutMs,
    token,
  );
  if (unauthorized.status !== 401) {
    throw new Error("Environment service accepted an unauthenticated metadata request.");
  }
  const metadata = await requestJson(
    `${baseUrl}/metadata`,
    token,
    timeoutMs,
    token,
  );
  if (metadata.status !== 200) {
    throw new Error("Environment service metadata request failed.");
  }

  const rows: Array<{
    scenario: string;
    jurisdiction: string;
    round: number;
    latencyMs: number;
    buildingCount: number;
    datasetVersion: string | null;
  }> = [];
  for (const scenario of SCENARIOS) {
    for (let round = 1; round <= rounds; round += 1) {
      const response = await requestJson(
        `${baseUrl}/buildings?bbox=${encodeURIComponent(scenario.bbox)}`,
        token,
        timeoutMs,
        token,
      );
      if (response.status !== 200 || !Array.isArray(response.body.buildings)) {
        const error =
          typeof response.body.error === "string" ? response.body.error : "unknown error";
        throw new Error(
          `Environment query failed for ${scenario.id} round ${round}: HTTP ${response.status} ${error}.`,
        );
      }
      const responseMetadata = asRecord(response.body.metadata);
      rows.push({
        scenario: scenario.id,
        jurisdiction: scenario.jurisdiction,
        round,
        latencyMs: response.latencyMs,
        buildingCount: response.body.buildings.length,
        datasetVersion:
          typeof responseMetadata.datasetVersion === "string"
            ? responseMetadata.datasetVersion
            : null,
      });
    }
  }
  const latencies = rows.map((row) => row.latencyMs);
  const coldLatencies = rows.filter((row) => row.round === 1).map((row) => row.latencyMs);
  const warmLatencies = rows.filter((row) => row.round > 1).map((row) => row.latencyMs);
  const p95Ms = percentile(latencies, 0.95);
  const report = {
    format: "comfortos-environment-deployment-benchmark-v1",
    createdAt: new Date().toISOString(),
    service: baseUrl,
    deployment: {
      id: deployment.id,
      release: deployment.release,
      jurisdictionCount: deployment.jurisdictionCount,
      storeCount: deployment.storeCount,
    },
    requestCount: rows.length + 3,
    estimatedMinimumR2ObjectOpens: SCENARIOS.length * 4,
    note:
      "Actual FUSE range and metadata operations must be read from Cloudflare R2 metrics.",
    summary: {
      scenarioCount: SCENARIOS.length,
      rounds,
      p50Ms: percentile(latencies, 0.5),
      p95Ms,
      maximumMs: Math.max(...latencies),
      coldP95Ms: percentile(coldLatencies, 0.95),
      warmP95Ms: percentile(warmLatencies, 0.95),
      maximumP95Ms,
      accepted: p95Ms <= maximumP95Ms,
    },
    rows,
  };
  if (!report.summary.accepted) {
    throw new Error(
      `Environment query p95 ${p95Ms}ms exceeds ${maximumP95Ms}ms.`,
    );
  }
  if (args.output) await writeJsonAtomic(path.resolve(args.output), report);
  console.log(JSON.stringify(report, null, 2));
}

async function requestJson(
  url: string,
  token: string | undefined,
  timeoutMs: number,
  secret: string,
) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (text.includes(secret)) {
    throw new Error("Environment service response exposed its bearer token.");
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Environment service returned non-JSON status ${response.status}.`);
  }
  return {
    status: response.status,
    body,
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

export function percentile(values: number[], quantile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(quantile * sorted.length) - 1];
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

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    throw new Error("Environment service URL must use HTTPS outside localhost.");
  }
  return url.toString().replace(/\/$/, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Environment service response is missing required metadata.");
  }
  return value as Record<string, unknown>;
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
    throw new Error("Expected a positive integer option.");
  }
  return parsed;
}

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Expected a positive number option.");
  }
  return parsed;
}

function requireEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function isMissingFile(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

if (process.argv[1]?.endsWith("benchmark-environment-deployment.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
