# ADR-028 - Cloudflare R2 FUSE Environment Staging

Date: 2026-09-13
Status: Proposed

## Context

The accepted nationwide Overture archive is 99,541,442,479 bytes. Cloudflare Containers
currently provide ephemeral container disk and cap a single instance at 20 GB, so the
ADR-027 durable-volume restore cannot fit inside that platform. Cloudflare now documents
read-only R2 mounts through FUSE, allowing the existing filesystem provider to read an
immutable object prefix without copying the entire release into the image or instance disk.

FUSE over object storage is not equivalent to local SSD storage. Rehashing the complete
building file on every cold container instance also exceeds the service timeout. The archive
pipeline already downloads and SHA-256 verifies every uploaded object before it commits the
remote state manifest, but relying on that verification requires an explicit trust boundary.

## Proposed Decision

Evaluate one Cloudflare Container staging deployment with these constraints:

- Mount the R2 bucket read-only using pinned `tigrisfs` 1.2.2 and a pinned archive SHA-256.
- Generate the image's small deployment bundle by downloading and checksum-verifying only
  the 51 state manifests and 20,758 partition manifests.
- Keep the 99.54 GB payload in its immutable R2 release prefix.
- Load catalog metadata lazily at startup and verify the selected partition manifest, tile
  index, and offset index on first use.
- In this R2-only mode, trust the whole building-file checksum verified during archival
  instead of streaming the full object before random-access reads. Keep full runtime
  verification as the default for durable-volume and development stores.
- Route requests to one named container during the benchmark so warm-cache measurements
  are interpretable.
- Pass only the R2 credentials and environment-service bearer token as Worker secrets.
- Require the nationwide bundle audit, authenticated smoke test, cold/warm latency gate,
  R2 operation metrics, and rollback rehearsal before accepting this ADR.

This proposal does not supersede ADR-027. A conventional host with adequate durable volume
remains the accepted deployment model until the R2 FUSE benchmark is complete.

## Acceptance Evidence Required

1. Health reports the expected deployment, release, 51 jurisdictions, and 20,758 stores.
2. Unauthenticated private endpoints return `401`, and no credential appears in responses
   or logs.
3. Nine geographically distributed state queries succeed with p95 at or below 8 seconds.
4. Cold and warm latency are reported separately.
5. Cloudflare metrics record actual R2 Class A/B operations and container active duration.
6. A previous immutable deployment history entry can replace the active pointer and serve
   successfully after restart.
7. The production fixture and provider-readiness audits remain clean.

## Consequences

- Staging preparation transfers only small manifests, not nationwide building payloads.
- The container image remains well below the platform disk limit.
- Runtime integrity now depends on immutable archive operations and a dedicated read-only R2
  runtime key. Any ability for the serving principal to mutate objects rejects this proposal.
- Cold partition access or request amplification may still make the platform unsuitable;
  failure of the latency or cost gates means retaining ADR-027 and selecting a durable-volume
  host.
- Actual deployment requires a Cloudflare-authenticated Wrangler session, Workers Paid
  plan access to Containers, and a local Docker-compatible builder.

## Local Validation

The 2026-09-13 local native-container rehearsal passed the bundle and nine-region service
gates. The 36,866,892-byte deployment bundle loaded in 302 ms in the latest audit; nine cold/warm R2-backed
queries reported 3,957 ms cold p95 and 46 ms warm p95. Content-checksum deduplication removed
1,722 duplicate border stores from the runtime provider set without changing the 20,758-entry
audit catalog.

The authenticated local application rehearsal also passed all nine regions through the
ComfortOS API with 35/35 comparable candidates and a 2,451 ms maximum response time. It
verified the pinned Overture release and managed Mapbox metadata but does not substitute for
the native Cloudflare deployment evidence required above.

This evidence is encouraging but does not accept the ADR. Native Cloudflare AMD64 latency,
R2 operation counts, container active duration, read-only runtime credentials, and rollback
evidence are still required.

## References

- [Cloudflare: Mount R2 buckets with FUSE](https://developers.cloudflare.com/containers/examples/r2-fuse-mount/)
- [Cloudflare Containers limits](https://developers.cloudflare.com/containers/platform/limits/)
- [Cloudflare Containers get started](https://developers.cloudflare.com/containers/get-started/)
- [tigrisfs v1.2.2](https://github.com/tigrisdata/tigrisfs/releases/tag/v1.2.2)
