import fs from "node:fs/promises";
import routes from "@/fixtures/routes/minneapolis-stage-5-5-routes.json";

type Mode = "osrm-only" | "enhanced";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseUrl = options.baseUrl ?? "http://127.0.0.1:3001";
  const departureTime = options.departureTime ?? new Date().toISOString();
  const modes = (options.modes?.split(",") as Mode[] | undefined) ?? [
    "osrm-only",
    "enhanced",
  ];
  const rows = [];

  for (const route of routes) {
    for (const mode of modes) {
      rows.push(await runRoute(baseUrl, route, mode, departureTime));
    }
  }

  const report = {
    createdAt: new Date().toISOString(),
    routeCount: routes.length,
    modes,
    summary: summarize(rows),
    rows,
  };

  if (options.output) {
    await fs.writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(report, null, 2));
}

async function runRoute(
  baseUrl: string,
  route: (typeof routes)[number],
  generationMode: Mode,
  departureTime: string,
) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/api/routes/comfort-comparison`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin: route.origin,
      destination: route.destination,
      departureTime,
      generationMode,
      includeEnvironmentalDebug: false,
      generationPolicy: {
        maxEnvironmentAnalyzedCandidates: 5,
        maxCandidateAttempts: 8,
      },
    }),
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const text = await response.text();

  if (!response.ok) {
    return {
      routeId: route.id,
      label: route.label,
      category: route.category,
      generationMode,
      success: false,
      elapsedMs,
      providerFailure: true,
      error: text.slice(0, 300),
    };
  }

  const comparison = JSON.parse(text).comparison;
  const candidates = comparison.debug.candidates as Array<{
    selectedRole: string;
    comparable: boolean;
    generator: string;
    uniqueMeters: number;
    rawEnvironmentalCost: number | null;
    routeOverlapRatio: number;
    durationSeconds: number;
  }>;
  const comparableCandidates = candidates.filter((candidate) => candidate.comparable);
  const fastest = comparison.fastest;
  const comfort = comparison.comfort;

  return {
    routeId: route.id,
    label: route.label,
    category: route.category,
    generationMode,
    success: true,
    elapsedMs,
    providerFailure: false,
    generatedCandidateCount: comparison.debug.generation?.generatedCandidates ?? candidates.length,
    diverseCandidateCount: candidates.filter((candidate) => candidate.uniqueMeters >= 40).length,
    comparableCandidateCount: comparableCandidates.length,
    partialAnalysisCount: candidates.length - comparableCandidates.length,
    buildingProviderMode: comparison.debug.buildings?.providerMode ?? "unknown",
    loadedBuildings: comparison.debug.buildings?.loadedBuildings ?? 0,
    buildingQuerySucceeded: comparison.debug.buildings?.querySucceeded ?? false,
    comfortDiffersFromFastest: fastest.id !== comfort.id,
    noChangeReason: fastest.id !== comfort.id ? null : inferNoChangeReason(candidates),
    rawCostRange: range(comparableCandidates.map((candidate) => candidate.rawEnvironmentalCost)),
    overlapRange: range(candidates.map((candidate) => candidate.routeOverlapRatio)),
    routeGenerationMs: comparison.debug.performanceMs.routingCandidates,
    weatherMs: comparison.debug.performanceMs.weather,
    buildingFetchMs: comparison.debug.performanceMs.buildingFetch,
    shadeMs: comparison.debug.performanceMs.shadeAnalysis,
    windMs: comparison.debug.performanceMs.windAnalysis,
    comfortMs: comparison.debug.performanceMs.comfortAnalysis,
    rerankingMs: comparison.debug.performanceMs.reranking,
    totalMs: comparison.debug.performanceMs.total,
  };
}

function summarize(rows: Awaited<ReturnType<typeof runRoute>>[]) {
  const successes = rows.filter((row) => row.success);
  const enhanced = successes.filter((row) => row.generationMode === "enhanced");
  const comfortDifferent = enhanced.filter((row) => row.comfortDiffersFromFastest);

  return {
    searchCount: rows.length,
    successCount: successes.length,
    providerFailureCount: rows.filter((row) => row.providerFailure).length,
    generatedCandidateAverage: average(successes.map((row) => row.generatedCandidateCount ?? 0)),
    diverseCandidateAverage: average(successes.map((row) => row.diverseCandidateCount ?? 0)),
    comparableCandidateAverage: average(successes.map((row) => row.comparableCandidateCount ?? 0)),
    partialAnalysisCount: successes.reduce(
      (sum, row) => sum + (row.partialAnalysisCount ?? 0),
      0,
    ),
    comfortDiffersFromFastestCount: comfortDifferent.length,
    comfortDiffersFromFastestRate:
      enhanced.length > 0 ? comfortDifferent.length / enhanced.length : 0,
    latency: {
      averageTotalMs: average(successes.map((row) => row.totalMs ?? row.elapsedMs)),
      p95TotalMs: percentile(successes.map((row) => row.totalMs ?? row.elapsedMs), 0.95),
      averageBuildingFetchMs: average(successes.map((row) => row.buildingFetchMs ?? 0)),
      averageShadeMs: average(successes.map((row) => row.shadeMs ?? 0)),
      averageWindMs: average(successes.map((row) => row.windMs ?? 0)),
    },
    noChangeReasons: countBy(
      enhanced.flatMap((row) =>
        row.comfortDiffersFromFastest ? [] : [row.noChangeReason ?? "unknown"],
      ),
    ),
  };
}

function inferNoChangeReason(
  candidates: Array<{ comparable: boolean; uniqueMeters: number }>,
) {
  if (candidates.every((candidate) => !candidate.comparable)) return "candidate incomplete";
  if (candidates.filter((candidate) => candidate.uniqueMeters >= 40).length <= 1) {
    return "no meaningful candidate diversity";
  }
  return "fastest already best or insufficient improvement";
}

function range(values: Array<number | null>) {
  const numeric = values.filter((value): value is number => typeof value === "number");
  if (numeric.length < 2) return null;
  return Math.max(...numeric) - Math.min(...numeric);
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function parseArgs(args: string[]) {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    }
    options[toCamelCase(key.slice(2))] = value;
  }
  return options;
}

function toCamelCase(value: string) {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
