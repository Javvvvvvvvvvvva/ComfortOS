import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";

const DEFAULT_CONFIG = "wrangler.environment-service.generated.jsonc";

function main() {
  const args = parseArgs(process.argv.slice(2));
  const envPath = path.resolve(args.envFile ?? ".env.local");
  const configPath = path.resolve(args.config ?? DEFAULT_CONFIG);

  if (!fs.existsSync(envPath)) {
    throw new Error(`Environment file not found: ${envPath}`);
  }
  if (!fs.existsSync(configPath)) {
    throw new Error(`Wrangler config not found: ${configPath}`);
  }

  loadEnvFile(envPath);

  const serviceToken = requireEnvironment("ENVIRONMENT_QUERY_SERVICE_TOKEN");
  const runtimeAccessKeyId = requireEnvironment("R2_RUNTIME_ACCESS_KEY_ID");
  const runtimeSecretAccessKey = requireEnvironment(
    "R2_RUNTIME_SECRET_ACCESS_KEY",
  );

  if (serviceToken.length < 32) {
    throw new Error("ENVIRONMENT_QUERY_SERVICE_TOKEN must be at least 32 characters.");
  }
  if (!/^[0-9a-f]{32}$/i.test(runtimeAccessKeyId)) {
    throw new Error("R2_RUNTIME_ACCESS_KEY_ID must be a 32-character hexadecimal key.");
  }
  if (!/^[0-9a-f]{64}$/i.test(runtimeSecretAccessKey)) {
    throw new Error(
      "R2_RUNTIME_SECRET_ACCESS_KEY must be a 64-character hexadecimal key.",
    );
  }
  if (
    runtimeAccessKeyId === process.env.R2_ACCESS_KEY_ID ||
    runtimeSecretAccessKey === process.env.R2_SECRET_ACCESS_KEY
  ) {
    throw new Error("Runtime R2 credentials must not reuse archive writer credentials.");
  }

  const secrets = [
    ["ENVIRONMENT_QUERY_SERVICE_TOKEN", serviceToken],
    ["R2_ACCESS_KEY_ID", runtimeAccessKeyId],
    ["R2_SECRET_ACCESS_KEY", runtimeSecretAccessKey],
  ] as const;

  for (const [bindingName, value] of secrets) {
    const result = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      [
        "wrangler",
        "secret",
        "put",
        bindingName,
        "--config",
        configPath,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
        input: `${value}\n`,
        stdio: ["pipe", "inherit", "inherit"],
      },
    );

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Failed to configure Worker secret ${bindingName}.`);
    }
  }

  console.log("Configured 3 Cloudflare Worker secrets without printing their values.");
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseArgs(values: string[]) {
  const result: { config?: string; envFile?: string } = {};

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const next = values[index + 1];
    if (value === "--config" && next) {
      result.config = next;
      index += 1;
    } else if (value === "--env-file" && next) {
      result.envFile = next;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${value}`);
    }
  }

  return result;
}

main();
