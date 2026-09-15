import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const auditOrigin = "https://ahhway.javacoding2022.chatgpt.site";
const outputRoot = mkdtempSync(join(tmpdir(), "ahhway-release-bundles-"));
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const forbidden = [
  { label: "local iOS API", pattern: /https?:\/\/localhost(?::\d+)?/i },
  { label: "local Android emulator API", pattern: /https?:\/\/10\.0\.2\.2(?::\d+)?/i },
  { label: "loopback API", pattern: /https?:\/\/127\.0\.0\.1(?::\d+)?/i },
  { label: "Mapbox token", pattern: /pk\.eyJ[A-Za-z0-9._-]{20,}/ },
  { label: "R2 credential name", pattern: /R2_(?:RUNTIME_)?(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY)/ },
  { label: "server token name", pattern: /(?:BUILDING|ENVIRONMENT)_QUERY_SERVICE_TOKEN/ },
];

try {
  for (const platform of ["ios", "android"]) {
    const outputDirectory = join(outputRoot, platform);
    const result = spawnSync(
      npx,
      [
        "expo",
        "export",
        "--platform",
        platform,
        "--output-dir",
        outputDirectory,
        "--clear",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          EAS_BUILD_PROFILE: "production",
          EAS_BUILD_PLATFORM: platform,
          EXPO_PUBLIC_API_BASE_URL: auditOrigin,
          EXPO_PUBLIC_SITE_URL: auditOrigin,
          ...(platform === "android"
            ? { GOOGLE_MAPS_API_KEY: "release-audit-not-a-secret" }
            : {}),
        },
        encoding: "utf8",
      },
    );
    if (result.status !== 0) {
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
      throw new Error(`${platform} release export failed.`);
    }
    auditExport(outputDirectory, platform);
  }

  console.log("iOS and Android release bundle audit passed.");
} finally {
  rmSync(outputRoot, { force: true, recursive: true });
}

function auditExport(root, platform) {
  const files = listFiles(root);
  if (files.length === 0) throw new Error(`${platform} release export is empty.`);

  let hasBundle = false;
  let hasExpectedOrigin = false;
  const findings = [];

  for (const filePath of files) {
    const bytes = readFileSync(filePath);
    const fileName = basename(filePath);
    if (/\.(?:hbc|jsbundle|js)$/i.test(fileName) && bytes.length > 0) hasBundle = true;
    const content = bytes.toString("utf8");
    if (content.includes(auditOrigin)) hasExpectedOrigin = true;
    for (const signature of forbidden) {
      if (signature.pattern.test(content)) {
        findings.push(`${relative(root, filePath)}: ${signature.label}`);
      }
    }
  }

  if (!hasBundle) throw new Error(`${platform} release export has no application bundle.`);
  if (!hasExpectedOrigin) {
    throw new Error(`${platform} release bundle does not contain its configured API origin.`);
  }
  if (findings.length > 0) {
    throw new Error(`${platform} release bundle audit failed:\n${findings.join("\n")}`);
  }
}

function listFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const filePath = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(filePath));
    else if (entry.isFile() && statSync(filePath).size > 0) files.push(filePath);
  }
  return files;
}
