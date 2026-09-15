import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tracked = spawnSync("git", ["ls-files", "-z"], {
  cwd: repositoryRoot,
  encoding: "utf8",
});

if (tracked.status !== 0) {
  process.stderr.write(tracked.stderr || "Unable to enumerate tracked files.\n");
  process.exit(tracked.status ?? 1);
}

const binaryExtensions = new Set([
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".webp",
  ".zip",
]);
const signatures = [
  { name: "Mapbox token", pattern: /pk\.eyJ[A-Za-z0-9._-]{20,}/ },
  { name: "Cloudflare API token", pattern: /cfat_[A-Za-z0-9_-]{20,}/ },
  { name: "GitHub token", pattern: /gh[opusr]_[A-Za-z0-9_]{30,}/ },
  { name: "AWS access key", pattern: /AKIA[A-Z0-9]{16}/ },
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];
const findings = [];

for (const relativePath of tracked.stdout.split("\0").filter(Boolean)) {
  if (binaryExtensions.has(extname(relativePath).toLowerCase())) continue;
  const content = readFileSync(resolve(repositoryRoot, relativePath), "utf8");
  for (const signature of signatures) {
    if (signature.pattern.test(content)) findings.push(`${relativePath}: ${signature.name}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`Release secret audit failed:\n${findings.join("\n")}\n`);
  process.exit(1);
}

console.log(`Release secret audit passed (${tracked.stdout.split("\0").filter(Boolean).length} tracked files).`);

