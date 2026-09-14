import fs from "node:fs/promises";
import path from "node:path";
import {
  parseEnvironmentSourceCatalog,
  type EnvironmentSourceCatalogEntry,
} from "@/lib/environment/sources/catalog";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalogPath = path.resolve(
    args.catalog ?? "config/data-sources/environment-layers-v1.json",
  );
  const catalog = parseEnvironmentSourceCatalog(
    JSON.parse(await fs.readFile(catalogPath, "utf8")),
  );
  const live = args.live === "true";
  const checks = live ? await checkAccess(catalog.sources) : [];
  const accepted = checks.every((check) => check.ok);
  const byActivation = Object.fromEntries(
    ["pilot", "candidate", "fallback-only", "coverage-gap"].map((status) => [
      status,
      catalog.sources.filter((source) => source.activation === status).length,
    ]),
  );

  console.log(
    JSON.stringify(
      {
        accepted,
        catalogPath,
        format: catalog.format,
        updatedAt: catalog.updatedAt,
        sourceCount: catalog.sources.length,
        layers: [...new Set(catalog.sources.map((source) => source.layer))].sort(),
        byActivation,
        liveChecked: live,
        checks,
      },
      null,
      2,
    ),
  );
  if (!accepted) process.exitCode = 1;
}

async function checkAccess(sources: EnvironmentSourceCatalogEntry[]) {
  return Promise.all(
    sources.map(async (source) => {
      try {
        const response = await fetch(source.access.url, {
          headers: { Accept: "text/html,application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        return {
          id: source.id,
          ok: response.ok,
          status: response.status,
        };
      } catch (error) {
        return {
          id: source.id,
          ok: false,
          error: error instanceof Error ? error.name : "unknown",
        };
      }
    }),
  );
}

function parseArgs(args: string[]) {
  const result: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    }
    result[key.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value;
  }
  return result;
}

if (process.argv[1]?.endsWith("audit-environment-source-catalog.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
