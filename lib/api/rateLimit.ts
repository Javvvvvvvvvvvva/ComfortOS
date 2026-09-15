export type RateLimitPolicy = {
  scope: string;
  limit: number;
  windowMs: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  headers: Record<string, string>;
};

type WindowEntry = {
  count: number;
  resetAt: number;
};

const MAX_ENTRIES = 10_000;
const clientHashSalt = Math.random().toString(36).slice(2);

export const API_RATE_LIMITS = {
  geocoding: { scope: "geocoding", limit: 120, windowMs: 60_000 },
  weather: { scope: "weather", limit: 60, windowMs: 60_000 },
  walking: { scope: "walking", limit: 40, windowMs: 60_000 },
  comfort: { scope: "comfort", limit: 20, windowMs: 60_000 },
} satisfies Record<string, RateLimitPolicy>;

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, WindowEntry>();

  check(key: string, policy: RateLimitPolicy, now = Date.now()): RateLimitDecision {
    const scopedKey = `${policy.scope}:${key}`;
    const current = this.entries.get(scopedKey);
    const entry =
      current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + policy.windowMs };
    entry.count += 1;
    this.entries.delete(scopedKey);
    this.entries.set(scopedKey, entry);
    this.prune(now);

    const allowed = entry.count <= policy.limit;
    const remaining = Math.max(0, policy.limit - entry.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1_000));
    return {
      allowed,
      limit: policy.limit,
      remaining,
      retryAfterSeconds,
      headers: {
        "RateLimit-Limit": String(policy.limit),
        "RateLimit-Remaining": String(remaining),
        "RateLimit-Reset": String(Math.ceil(entry.resetAt / 1_000)),
        ...(allowed ? {} : { "Retry-After": String(retryAfterSeconds) }),
      },
    };
  }

  private prune(now: number) {
    if (this.entries.size < MAX_ENTRIES) return;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }
}

const limiter = new FixedWindowRateLimiter();

export function checkRequestRateLimit(
  request: Request,
  policy: RateLimitPolicy,
): RateLimitDecision {
  return limiter.check(clientKey(request), policy);
}

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address =
    request.headers.get("cf-connecting-ip")?.trim() || forwarded || "unknown-client";
  return nonCryptographicHash(`${clientHashSalt}:${address}`);
}

function nonCryptographicHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
