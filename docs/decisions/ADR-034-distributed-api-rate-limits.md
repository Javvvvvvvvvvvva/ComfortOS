# ADR-034 - Distributed API Rate Limits

Date: 2026-09-14
Status: Accepted

## Context

Ahhway's geocoding, weather, walking, and Comfort endpoints call managed or metered
providers. The existing fixed-window limiter runs inside one JavaScript isolate, so separate
Cloudflare Worker instances do not share counters. That is useful as a local fallback but is
not sufficient protection for a public mobile API.

## Decision

The Sites Worker entry point enforces a second fixed-window limit for cost-bearing API paths
using atomic Cloudflare D1 upserts. Each key combines the API scope, minute window, and a
SHA-256 digest of the Cloudflare-provided client address with a deployment secret. Raw client
addresses and the secret are never persisted or logged.

Production declares `DISTRIBUTED_RATE_LIMIT_PROVIDER=cloudflare-d1`, provisions the logical
`DB` binding through `.openai/hosting.json`, and stores `RATE_LIMIT_HASH_SALT` as a hosted
secret. A configured limiter fails closed with `503` if its database, secret, or atomic write
is unavailable. Exceeded limits return `429` with standard limit and retry headers. Expired
windows are sampled for asynchronous deletion.

The in-process limiter remains behind the API handlers as defense in depth and for local
development. Health readiness cannot report production-ready unless the distributed provider
and minimum-length secret are configured.

## Consequences

- Limits are shared across Worker instances before a request reaches provider-specific code.
- Stored identifiers are pseudonymous, bounded-lived hashes rather than precise addresses.
- Each protected request adds one D1 write, so usage and latency must be monitored before
  changing limits.
- A D1 outage intentionally blocks cost-bearing endpoints while static, policy, and health
  pages remain available.
