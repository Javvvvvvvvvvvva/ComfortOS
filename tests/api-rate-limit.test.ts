import assert from "node:assert/strict";
import test from "node:test";
import { FixedWindowRateLimiter } from "@/lib/api/rateLimit";

test("API rate limiter isolates scopes and resets bounded windows", () => {
  const limiter = new FixedWindowRateLimiter();
  const policy = { scope: "comfort", limit: 2, windowMs: 1_000 };

  assert.equal(limiter.check("client-a", policy, 10_000).allowed, true);
  assert.equal(limiter.check("client-a", policy, 10_100).remaining, 0);
  const blocked = limiter.check("client-a", policy, 10_200);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.headers["Retry-After"], "1");
  assert.equal(
    limiter.check("client-a", { ...policy, scope: "walking" }, 10_200).allowed,
    true,
  );
  assert.equal(limiter.check("client-a", policy, 11_001).allowed, true);
});

test("API rate limiter does not combine different clients", () => {
  const limiter = new FixedWindowRateLimiter();
  const policy = { scope: "weather", limit: 1, windowMs: 60_000 };

  assert.equal(limiter.check("client-a", policy, 0).allowed, true);
  assert.equal(limiter.check("client-a", policy, 1).allowed, false);
  assert.equal(limiter.check("client-b", policy, 1).allowed, true);
});
