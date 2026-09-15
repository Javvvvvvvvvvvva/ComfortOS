/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  DistributedFixedWindowRateLimiter,
  getEdgeRateLimitPolicy,
} from "../lib/api/distributedRateLimit";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  DISTRIBUTED_RATE_LIMIT_PROVIDER?: string;
  RATE_LIMIT_HASH_SALT?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(response);
    }

    const edgeLimit = await applyEdgeRateLimit(request, env, ctx);
    if (edgeLimit?.response) return withSecurityHeaders(edgeLimit.response);

    return withSecurityHeaders(
      await handler.fetch(request, env, ctx),
      edgeLimit?.headers,
    );
  },
};

async function applyEdgeRateLimit(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) {
  const policy = getEdgeRateLimitPolicy(new URL(request.url).pathname);
  if (!policy) return null;

  const provider = env.DISTRIBUTED_RATE_LIMIT_PROVIDER?.trim();
  if (!provider) return null;
  if (provider !== "cloudflare-d1" || !env.DB || !env.RATE_LIMIT_HASH_SALT) {
    return { response: unavailableRateLimitResponse() };
  }

  try {
    const limiter = new DistributedFixedWindowRateLimiter(
      env.DB,
      env.RATE_LIMIT_HASH_SALT,
    );
    const clientAddress = request.headers.get("cf-connecting-ip")?.trim() || "unknown-client";
    const decision = await limiter.check(clientAddress, policy);
    if (decision.shouldPrune) {
      ctx.waitUntil(limiter.prune());
    }
    if (!decision.allowed) {
      return {
        response: Response.json(
          { error: "Too many requests. Please try again shortly." },
          { status: 429, headers: decision.headers },
        ),
      };
    }
    return { headers: decision.headers };
  } catch {
    console.error(JSON.stringify({
      event: "distributed_rate_limit_failed",
      scope: policy.scope,
    }));
    return { response: unavailableRateLimitResponse() };
  }
}

function unavailableRateLimitResponse() {
  return Response.json(
    { error: "Request protection is temporarily unavailable." },
    { status: 503, headers: { "Retry-After": "30" } },
  );
}

function withSecurityHeaders(
  response: Response,
  additionalHeaders: Record<string, string> = {},
) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(additionalHeaders)) {
    headers.set(name, value);
  }
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default worker;
