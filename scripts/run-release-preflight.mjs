import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const skipNetwork = process.argv.includes("--skip-network");
const steps = [
  ["Root typecheck", "npm", ["run", "typecheck"]],
  ["Root tests", "npm", ["test"]],
  ["Lint", "npm", ["run", "lint"]],
  ["Environment service typecheck", "npm", ["run", "environment:cloudflare:typecheck"]],
  ["Production web build", "npm", ["run", "build"]],
  ["Mobile typecheck", "npm", ["run", "mobile:typecheck"]],
  ["Mobile tests", "npm", ["run", "mobile:test"]],
  ...(skipNetwork ? [] : [["Expo Doctor", "npm", ["run", "mobile:doctor"]]]),
  ["Tracked secret audit", "npm", ["run", "release:audit-secrets"]],
  ["Patch whitespace audit", "git", ["diff", "--check"]],
];

for (const [label, command, args] of steps) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`\nRelease preflight stopped at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nRelease preflight passed.");

