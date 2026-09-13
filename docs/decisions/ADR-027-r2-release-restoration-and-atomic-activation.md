# ADR-027 - R2 Release Restoration and Atomic Activation

Date: 2026-09-13
Status: Accepted

## Context

Stage 10.5 archived the complete `2026-08-19.0` United States Overture building release in
Cloudflare R2 and pruned local build data. R2 is the immutable source of truth, but the
private environment query service intentionally reads local random-access files from a
durable volume. Treating archival as deployment would skip capacity checks, make rollback
ambiguous, and force the service to discover and read more than twenty thousand partition
manifests before it could answer a nationwide request.

## Decision

ComfortOS promotes an archived release in three explicit phases:

1. Preflight every state archive manifest against its Git-tracked checkpoint without
   downloading the large partition payloads.
2. Restore immutable objects to a durable, versioned release directory. Downloads use
   temporary files, exact byte and SHA-256 verification, bounded concurrency, resume by
   verified local reuse, and a free-space floor.
3. Build one compact catalog containing the normalized partition bounds and manifests. An
   explicit activation command verifies every cataloged partition manifest, snapshots the
   catalog under its content hash, writes immutable deployment history, and atomically
   replaces `production-active.json`.

The environment query service may start from
`ENVIRONMENT_ACTIVE_DEPLOYMENT_MANIFEST`. It verifies the active catalog checksum and uses
catalog bounds for partition selection, while each selected local provider verifies the
on-disk partition manifest before loading its data. Explicit store roots remain available
for development but cannot be combined with an active deployment manifest.

R2 remains storage, not an application query engine. Production requests continue through
the authenticated environment service, and activation never changes the app worker's
provider boundary.

## Consequences

- Archive completion and production activation remain separate, auditable states.
- Interrupted 100 GB restores can resume without trusting partial files.
- Active and historical deployments refer to immutable catalog bytes and can be rolled back
  by reactivating an earlier deployment.
- Nationwide startup avoids recursively discovering stores and reading every partition
  manifest solely to build a spatial index.
- A missing or modified catalog or selected partition manifest fails closed.
- The production host still needs a durable volume large enough for the restored release,
  private networking, monitoring, load evidence, and an operator-approved activation.

## Alternatives Considered

### Query Every Object Directly From R2

Deferred because the current random-access provider is file-backed and direct range reads
would add a second storage implementation, more per-route object requests, and new latency
and caching behavior before production evidence exists.

### Recursively Discover All Restored Stores At Startup

Retained only for development and small deployments. It needlessly scales startup metadata
I/O with all 20,758 partitions when the verified restore process can produce one compact
catalog.

### Overwrite One Mutable Catalog

Rejected because a restore or catalog rebuild could silently alter an active deployment and
invalidate rollback history.
