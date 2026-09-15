import assert from "node:assert/strict";

const baseUrl = (process.env.MOBILE_SMOKE_API_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const origin = { latitude: 44.9817, longitude: -93.2776 };
const destination = { latitude: 44.9585, longitude: -93.274 };
const departureTime = new Date().toISOString();

const liveHealth = await get("/api/health/live");
assert.equal(liveHealth.status, "ready", "Live provider health must pass.");
assert.equal(liveHealth.checks.routing.mode, "mapbox-managed");
assert.equal(liveHealth.checks.routing.ok, true);
assert.equal(liveHealth.checks.weather.ok, true);
assert.equal(liveHealth.checks.buildings.ok, true);

const [weatherPayload, searchPayload, fastestPayload] = await Promise.all([
  post("/api/weather", { coordinate: origin }),
  post("/api/geocoding/search", {
    query: "Target Field",
    proximity: origin,
    sessionToken: "mobile-smoke",
  }),
  post("/api/routes/walking", { origin, destination, departureTime }),
]);

assert.ok(weatherPayload.weather?.hourlyForecast?.length > 0, "Weather forecast is required.");
assert.ok(searchPayload.places?.length > 0, "Managed place search must return a result.");
assert.ok(
  fastestPayload.route?.geometry?.coordinates?.length > 1,
  "Fastest route geometry is required.",
);

const comparisonPayload = await post("/api/routes/comfort-comparison", {
  origin,
  destination,
  departureTime,
});
const comparison = comparisonPayload.comparison;
assert.ok(comparison?.fastest?.route, "Comparison must include the fastest candidate.");
assert.ok(comparison?.comfort?.route, "Comparison must include the comfort candidate.");
assert.ok(comparison?.candidates?.length > 0, "Comparison candidates are required.");
assert.equal(comparison.debug?.routingProvider?.mode, "managed");
assert.notEqual(comparison.debug?.routingProvider?.id, "osrm-public-demo");

console.log(
  JSON.stringify(
    {
      status: "passed",
      apiBaseUrl: baseUrl,
      liveHealth: liveHealth.status,
      geocodingResults: searchPayload.places.length,
      forecastPoints: weatherPayload.weather.hourlyForecast.length,
      candidateCount: comparison.candidates.length,
      comparableCount: comparison.candidates.filter(
        (candidate) => candidate.comfortAnalysis?.routeComfortCost?.comparable === true,
      ).length,
      routingProvider: comparison.debug.routingProvider.id,
      routingMode: comparison.debug.routingProvider.mode,
    },
    null,
    2,
  ),
);

async function get(path) {
  return request(path, { headers: { Accept: "application/json" } });
}

async function post(path, body) {
  return request(path, {
    method: "POST",
    headers: { Accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, payload.error ?? `${path} returned ${response.status}`);
  return payload;
}
