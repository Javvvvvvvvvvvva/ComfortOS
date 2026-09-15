import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  parseCoordinateBody,
  parseOptionalBodyString,
  requireJsonObject,
} from "@/lib/api/locationRequestBody";

test("location request bodies accept only finite valid coordinates", () => {
  assert.deepEqual(
    parseCoordinateBody({ latitude: 44.9778, longitude: -93.265 }),
    { latitude: 44.9778, longitude: -93.265 },
  );
  assert.equal(parseCoordinateBody({ latitude: "44.9778", longitude: -93.265 }), null);
  assert.equal(parseCoordinateBody({ latitude: 91, longitude: 0 }), null);
  assert.equal(parseCoordinateBody(null), null);
});

test("location request body parsing rejects arrays and bounds optional strings", () => {
  assert.throws(() => requireJsonObject([]), SyntaxError);
  assert.throws(() => requireJsonObject(null), SyntaxError);
  assert.deepEqual(requireJsonObject({ query: "Target Field" }), {
    query: "Target Field",
  });
  assert.equal(parseOptionalBodyString(" mobile-smoke ", 32), "mobile-smoke");
  assert.equal(parseOptionalBodyString("x".repeat(33), 32), undefined);
});

test("sensitive location endpoints and clients keep inputs out of query strings", () => {
  const root = process.cwd();
  const routeFiles = [
    "app/api/geocoding/search/route.ts",
    "app/api/geocoding/retrieve/route.ts",
    "app/api/geocoding/reverse/route.ts",
    "app/api/weather/route.ts",
  ];
  const clientFiles = [
    "lib/geocoding/client.ts",
    "lib/weather/client.ts",
    "apps/mobile/src/api/client.ts",
  ];

  for (const file of routeFiles) {
    const source = readFileSync(join(root, file), "utf8");
    assert.match(source, /export async function POST\(/, `${file} must accept POST`);
    assert.doesNotMatch(source, /export async function GET\(/, `${file} must reject GET`);
    assert.doesNotMatch(source, /searchParams/, `${file} must not parse location query data`);
  }

  for (const file of clientFiles) {
    const source = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(source, /searchParams/, `${file} must not send location query data`);
  }
});
