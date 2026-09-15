import {
  API_RATE_LIMITS,
  type RateLimitDecision,
  type RateLimitPolicy,
} from "@/lib/api/rateLimit";

type PreparedStatement = {
  bind(...values: unknown[]): PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
};

export type RateLimitDatabase = {
  prepare(query: string): PreparedStatement;
};

export type DistributedRateLimitDecision = RateLimitDecision & {
  shouldPrune: boolean;
};

const UPSERT_WINDOW_SQL = `
  INSERT INTO edge_rate_limit_windows (
    scope,
    client_hash,
    window_start_ms,
    request_count,
    expires_at_ms
  ) VALUES (?1, ?2, ?3, 1, ?4)
  ON CONFLICT(scope, client_hash, window_start_ms)
  DO UPDATE SET
    request_count = request_count + 1,
    expires_at_ms = excluded.expires_at_ms
  RETURNING request_count
`;

const PRUNE_WINDOWS_SQL = `
  DELETE FROM edge_rate_limit_windows
  WHERE expires_at_ms < ?1
`;

export class DistributedFixedWindowRateLimiter {
  constructor(
    private readonly database: RateLimitDatabase,
    private readonly hashSalt: string,
  ) {
    if (hashSalt.length < 16) {
      throw new Error("Distributed rate-limit hash salt must be at least 16 characters.");
    }
  }

  async check(
    clientAddress: string,
    policy: RateLimitPolicy,
    now = Date.now(),
  ): Promise<DistributedRateLimitDecision> {
    const windowStart = Math.floor(now / policy.windowMs) * policy.windowMs;
    const resetAt = windowStart + policy.windowMs;
    const clientHash = await hashClientAddress(this.hashSalt, clientAddress);
    const row = await this.database
      .prepare(UPSERT_WINDOW_SQL)
      .bind(policy.scope, clientHash, windowStart, resetAt)
      .first<{ request_count: unknown }>();
    const count = Number(row?.request_count);
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error("Distributed rate-limit storage returned an invalid count.");
    }

    const allowed = count <= policy.limit;
    const remaining = Math.max(0, policy.limit - count);
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1_000));
    const windowNumber = Math.floor(windowStart / policy.windowMs);
    const pruneSlot = Number.parseInt(clientHash.slice(0, 2), 16) % 32;

    return {
      allowed,
      limit: policy.limit,
      remaining,
      retryAfterSeconds,
      shouldPrune: count === 1 && windowNumber % 32 === pruneSlot,
      headers: {
        "RateLimit-Limit": String(policy.limit),
        "RateLimit-Remaining": String(remaining),
        "RateLimit-Reset": String(Math.ceil(resetAt / 1_000)),
        ...(allowed ? {} : { "Retry-After": String(retryAfterSeconds) }),
      },
    };
  }

  async prune(expiredBefore = Date.now()) {
    await this.database.prepare(PRUNE_WINDOWS_SQL).bind(expiredBefore).run();
  }
}

export function getEdgeRateLimitPolicy(pathname: string): RateLimitPolicy | null {
  if (
    pathname === "/api/geocoding/search" ||
    pathname === "/api/geocoding/retrieve" ||
    pathname === "/api/geocoding/reverse"
  ) {
    return API_RATE_LIMITS.geocoding;
  }
  if (pathname === "/api/weather") return API_RATE_LIMITS.weather;
  if (pathname === "/api/routes/walking") return API_RATE_LIMITS.walking;
  if (pathname === "/api/routes/comfort-comparison") return API_RATE_LIMITS.comfort;
  return null;
}

async function hashClientAddress(salt: string, clientAddress: string) {
  const bytes = new TextEncoder().encode(`${salt}:${clientAddress}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
