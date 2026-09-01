import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const productionRoots = ["app", "components", "lib"];
const productionExtensions = new Set([".ts", ".tsx"]);
const forbiddenImportPaths = [
  "fixtures/",
  "tests/",
  "docs/design/baseline/",
];
const designFixtureLiterals = [
  "18°F",
  "4°F",
  "48°F",
  "108°F",
  "24-48%",
  "15-35%",
  "24-62%",
  "18-64%",
  "Wind shelter in 300 ft",
  "Covered walkway in 2 min",
  "Shade begins in 2 min",
  "Protected for the next 6 min",
  "Shaded for ~5 min",
  "Bridge Path",
  "Elm St",
  "Garden Walk",
  "CITY_DATA",
];

test("production runtime code does not import fixture/test/design-baseline paths", () => {
  const violations = productionFiles().flatMap((file) => {
    const text = fs.readFileSync(file, "utf8");
    return importSpecifiers(text).flatMap((specifier) =>
      forbiddenImportPaths.some((forbidden) => specifier.includes(forbidden))
        ? [`${file}: ${specifier}`]
        : [],
    );
  });

  assert.deepEqual(violations, []);
});

test("production runtime code does not import Stage 6 research routing", () => {
  const violations = productionFiles().flatMap((file) => {
    const text = fs.readFileSync(file, "utf8");
    return importSpecifiers(text).flatMap((specifier) =>
      specifier.includes("routing-research") ? [`${file}: ${specifier}`] : [],
    );
  });

  assert.deepEqual(violations, []);
});

test("production runtime code does not contain Claude Design fixture literals", () => {
  const violations = productionFiles().flatMap((file) => {
    const text = fs.readFileSync(file, "utf8");
    return designFixtureLiterals.flatMap((literal) =>
      text.includes(literal) ? [`${file}: ${literal}`] : [],
    );
  });

  assert.deepEqual(violations, []);
});

function productionFiles() {
  return productionRoots.flatMap((root) => walk(root));
}

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entryPath === path.join("lib", "routing-research")) return [];
    if (entry.isDirectory()) return walk(entryPath);
    if (entry.isFile() && productionExtensions.has(path.extname(entry.name))) {
      return [entryPath];
    }
    return [];
  });
}

function importSpecifiers(text: string) {
  const specifiers: string[] = [];
  const importRegex = /\bimport\s+(?:[^'"]+?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportRegex = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  const requireRegex = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const regex of [importRegex, dynamicImportRegex, requireRegex]) {
    for (const match of text.matchAll(regex)) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}
