import fs from "node:fs/promises";
import type { ComfortRouteComparisonResult } from "@/lib/comfort-routing/types";
import type { Coordinate } from "@/lib/geo/types";
import type { RouteResult } from "@/lib/routing/types";
import type { WeatherBundle } from "@/lib/weather/types";

type SmokeCase = {
  id: "minneapolis" | "seattle" | "phoenix" | "chicago-unsupported";
  origin: Coordinate;
  destination: Coordinate;
  supported: boolean;
};

const CASES: SmokeCase[] = [
  {
    id: "minneapolis",
    origin: { latitude: 44.9778, longitude: -93.265 },
    destination: { latitude: 44.9815, longitude: -93.2512 },
    supported: true,
  },
  {
    id: "seattle",
    origin: { latitude: 47.6097, longitude: -122.3425 },
    destination: { latitude: 47.6231, longitude: -122.3384 },
    supported: true,
  },
  {
    id: "phoenix",
    origin: { latitude: 33.4533, longitude: -112.0738 },
    destination: { latitude: 33.4458, longitude: -112.0712 },
    supported: true,
  },
  {
    id: "chicago-unsupported",
    origin: { latitude: 41.8819, longitude: -87.6278 },
    destination: { latitude: 41.8897, longitude: -87.6244 },
    supported: false,
  },
];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseUrl = (options.baseUrl ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const departureTime = new Date().toISOString();
  const rows = [];

  for (const scenario of CASES) {
    const request = {
      origin: scenario.origin,
      destination: scenario.destination,
      departureTime,
    };
    const weatherResponse = await getJson(
      `${baseUrl}/api/weather?lat=${scenario.origin.latitude}&lon=${scenario.origin.longitude}`,
      12_000,
    );
    const weatherBundle = (weatherResponse.payload as { weather?: WeatherBundle }).weather;
    if (!weatherResponse.ok || !weatherBundle) {
      throw new Error(`${scenario.id}: live weather failed.`);
    }
    const weather = weatherBundle.current ?? weatherBundle.hourlyForecast[0] ?? null;
    const fastestStartedAt = performance.now();
    const fastestResponse = await postJson(`${baseUrl}/api/routes/walking`, request, 12_000);
    const fastest = (fastestResponse.payload as { route?: RouteResult }).route;
    const fastestMs = Math.round(performance.now() - fastestStartedAt);
    if (!fastestResponse.ok || !fastest) {
      throw new Error(`${scenario.id}: Fastest route failed.`);
    }

    const comfortStartedAt = performance.now();
    const comfortResponse = await postJson(
      `${baseUrl}/api/routes/comfort-comparison`,
      {
        ...request,
        generationMode: "enhanced",
        generationPolicy: {
          maxCandidateAttempts: 4,
          maxConcurrentCandidateRequests: 3,
          maxEnvironmentAnalyzedCandidates: 5,
        },
        includeEnvironmentalDebug: false,
      },
      35_000,
    );
    const comparison = (
      comfortResponse.payload as { comparison?: ComfortRouteComparisonResult }
    ).comparison;
    const comfortMs = Math.round(performance.now() - comfortStartedAt);
    if (!comfortResponse.ok || !comparison) {
      throw new Error(`${scenario.id}: Comfort comparison failed.`);
    }

    const comparableCandidates = comparison.candidates.filter(
      (candidate) => candidate.comfortAnalysis?.routeComfortCost.comparable === true,
    ).length;
    if (!scenario.supported && comparableCandidates !== 0) {
      throw new Error(`${scenario.id}: unsupported region unexpectedly became comparable.`);
    }

    rows.push({
      id: scenario.id,
      supported: scenario.supported,
      fastest: "ready",
      fastestMs,
      comfortMs,
      context: comparison.debug.context?.context ?? "balanced",
      contextualRouteLabel: comparison.debug.context?.routeLabel ?? "Comfort",
      candidateCount: comparison.candidates.length,
      comparableCandidates,
      sameRoute: comparison.fastest.id === comparison.comfort.id,
      weather: {
        source: weatherBundle.source,
        temperatureC: weather?.temperatureC ?? null,
        apparentTemperatureC: weather?.apparentTemperatureC ?? null,
        shortCondition: weather?.shortCondition ?? null,
        windSpeedMps: weather?.windSpeedMps ?? null,
        precipitationMmPerHour: weather?.precipitationMmPerHour ?? null,
        alertCount: weatherBundle.alerts.length,
      },
      capabilities: comparison.debug.capabilities ?? null,
      managedRoutingRequests:
        1 + (comparison.debug.routingUsage?.totalRequests ?? 0),
    });
  }

  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    rows,
    passed:
      rows.length === CASES.length &&
      rows.every((row) => row.fastest === "ready") &&
      rows.find((row) => row.id === "chicago-unsupported")?.comparableCandidates === 0,
  };

  if (options.output) {
    await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
}

async function getJson(url: string, timeoutMs: number) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { ok: response.ok, payload: await response.json() as unknown };
}

async function postJson(url: string, body: unknown, timeoutMs: number) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { ok: response.ok, payload: await response.json() as unknown };
}

function parseArgs(args: string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current?.startsWith("--")) continue;
    const key = current.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const value = args[index + 1];
    if (value && !value.startsWith("--")) {
      parsed[key] = value;
      index += 1;
    }
  }
  return parsed;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Stage 10 smoke failed.");
  process.exitCode = 1;
});
