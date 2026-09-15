import assert from "node:assert/strict";
import test from "node:test";
import {
  DistributedFixedWindowRateLimiter,
  getEdgeRateLimitPolicy,
  type RateLimitDatabase,
} from "@/lib/api/distributedRateLimit";

test("distributed limiter shares atomic counts across worker instances", async () => {
  const database = new FakeRateLimitDatabase();
  const policy = { scope: "comfort", limit: 2, windowMs: 1_000 };
  const firstWorker = new DistributedFixedWindowRateLimiter(database, "test-only-secret-salt");
  const secondWorker = new DistributedFixedWindowRateLimiter(database, "test-only-secret-salt");

  assert.equal((await firstWorker.check("203.0.113.4", policy, 10_000)).allowed, true);
  assert.equal((await secondWorker.check("203.0.113.4", policy, 10_100)).remaining, 0);
  const blocked = await firstWorker.check("203.0.113.4", policy, 10_200);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.headers["Retry-After"], "1");
  assert.equal((await firstWorker.check("203.0.113.5", policy, 10_200)).allowed, true);
  assert.equal(database.boundClientHashes.has("203.0.113.4"), false);
  assert.equal(database.boundClientHashes.size, 2);
});

test("distributed limiter resets windows and prunes expired counters", async () => {
  const database = new FakeRateLimitDatabase();
  const limiter = new DistributedFixedWindowRateLimiter(database, "test-only-secret-salt");
  const policy = { scope: "weather", limit: 1, windowMs: 1_000 };

  assert.equal((await limiter.check("203.0.113.8", policy, 1_000)).allowed, true);
  assert.equal((await limiter.check("203.0.113.8", policy, 1_500)).allowed, false);
  assert.equal((await limiter.check("203.0.113.8", policy, 2_000)).allowed, true);
  await limiter.prune(2_001);
  assert.equal(database.windows.size, 1);
});

test("edge rate limiting covers only cost-bearing public APIs", () => {
  assert.equal(getEdgeRateLimitPolicy("/api/geocoding/search")?.scope, "geocoding");
  assert.equal(getEdgeRateLimitPolicy("/api/weather")?.scope, "weather");
  assert.equal(getEdgeRateLimitPolicy("/api/routes/walking")?.scope, "walking");
  assert.equal(getEdgeRateLimitPolicy("/api/routes/comfort-comparison")?.scope, "comfort");
  assert.equal(getEdgeRateLimitPolicy("/api/health"), null);
  assert.equal(getEdgeRateLimitPolicy("/privacy"), null);
});

type WindowRow = {
  count: number;
  expiresAt: number;
};

class FakeRateLimitDatabase implements RateLimitDatabase {
  readonly windows = new Map<string, WindowRow>();
  readonly boundClientHashes = new Set<string>();

  prepare(query: string) {
    const { boundClientHashes, windows } = this;
    let values: unknown[] = [];
    const statement = {
      bind(...nextValues: unknown[]) {
        values = nextValues;
        return statement;
      },
      async first<T>() {
        assert.match(query, /ON CONFLICT/);
        const [scope, clientHash, windowStart, expiresAt] = values;
        assert.equal(typeof scope, "string");
        assert.match(String(clientHash), /^[a-f0-9]{64}$/);
        boundClientHashes.add(String(clientHash));
        const key = `${scope}:${clientHash}:${windowStart}`;
        const current = windows.get(key);
        const row = {
          count: (current?.count ?? 0) + 1,
          expiresAt: Number(expiresAt),
        };
        windows.set(key, row);
        return { request_count: row.count } as T;
      },
      async run() {
        assert.match(query, /DELETE FROM edge_rate_limit_windows/);
        const [expiredBefore] = values;
        for (const [key, row] of windows) {
          if (row.expiresAt < Number(expiredBefore)) windows.delete(key);
        }
        return {};
      },
    };
    return statement;
  }
}
