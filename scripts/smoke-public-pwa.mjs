const baseUrl = (process.env.AHHWAY_PUBLIC_URL ?? "https://ahhway.javacoding2022.chatgpt.site")
  .replace(/\/$/, "");

const checks = [];

await checkText("home", "/", "Ahhway");
await checkJson("manifest", "/manifest.webmanifest", (payload) => {
  assert(payload.short_name === "Ahhway", "manifest short name is not Ahhway");
  assert(payload.display === "standalone", "manifest is not standalone");
  assert(Array.isArray(payload.icons) && payload.icons.length >= 2, "manifest icons are missing");
});
await checkText("service-worker", "/sw.js", 'url.pathname.startsWith("/api/")');
await checkJson("regions", "/api/regions", (payload) => {
  assert(payload.summary?.jurisdictionCount === 51, "jurisdiction catalog is incomplete");
  assert(
    payload.summary?.environmentalDataDeployedJurisdictionCount === 51,
    "nationwide environment release is incomplete",
  );
});

await Promise.all([
  checkJson("routing", "/api/routes/routing-health", (payload) => {
    assert(payload.healthy === true, "managed routing health failed");
    assert(payload.mode === "mapbox-managed", "managed Mapbox mode is not active");
    assert(!JSON.stringify(payload).toLowerCase().includes("osrm"), "public OSRM appeared");
  }),
  checkJson(
    "weather",
    "/api/weather",
    (payload) => {
      assert(payload.weather?.source === "National Weather Service", "NWS weather is unavailable");
    },
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ coordinate: { latitude: 44.9778, longitude: -93.265 } }),
    },
  ),
]);

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), baseUrl, checks, passed: true }, null, 2));

async function checkJson(name, path, validate, init) {
  const response = await request(name, path, init);
  const payload = await response.json();
  validate(payload);
}

async function checkText(name, path, expected) {
  const response = await request(name, path);
  const body = await response.text();
  assert(body.includes(expected), `${name} response is missing expected content`);
}

async function request(name, path, init = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { accept: "application/json, text/plain, text/html", ...init.headers },
    signal: AbortSignal.timeout(15_000),
  });
  const latencyMs = Math.round(performance.now() - startedAt);
  assert(response.ok, `${name} returned HTTP ${response.status}`);
  checks.push({ name, status: response.status, latencyMs });
  return response;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
