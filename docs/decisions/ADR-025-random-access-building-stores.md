# ADR-025 - Random-Access Building Stores

Date: 2026-09-03
Status: Accepted

## Context

The first Chicago partition contained 450,693 buildings in a 219 MB JSONL file. The original
local provider used its tile index to filter results but still parsed the entire JSONL file
on first use. One loaded partition raised service RSS to approximately 821 MB. Retaining
multiple dense partitions would exhaust ordinary container memory before nationwide rollout
became practical.

## Decision

Each newly ingested Overture store includes `building-offsets.bin`. Every fixed-width
12-byte record contains an unsigned 64-bit byte offset and unsigned 32-bit byte length for
the corresponding JSONL building record. The existing tile index continues to map spatial
tiles to building record numbers.

For indexed stores, the local provider:

1. verifies the full building file by streaming its recorded SHA-256 checksum;
2. verifies and loads the tile and offset indexes;
3. reads only candidate JSONL records by byte position with bounded concurrency; and
4. preserves the existing geometry intersection and building normalization behavior.

Stores without the optional random-access manifest entry retain the previous loading path
for backward compatibility. A migration command adds the index and atomically publishes the
updated candidate manifest.

## Consequences

- Chicago cold-query latency fell from 1,483 ms to 255 ms.
- Service RSS after the same query fell from approximately 821 MB to 115 MB.
- The 482 returned building identifiers were identical before and after indexing.
- Full-file integrity verification remains in place without retaining the file contents.
- The JSONL artifact remains portable and inspectable; no database runtime is added.
- Tile and offset indexes still consume memory, so the existing bounded LRU policy remains
  required for large multi-partition deployments.

## Alternatives Considered

### Smaller Geographic Partitions Only

Rejected as the sole fix because it multiplies manifest and deployment counts and can still
load many adjacent files for one route.

### Load Full JSONL Files With A Smaller LRU

Rejected because even one dense partition consumed most of a small container's memory.

### Add A Database Runtime Immediately

Deferred. DuckDB, SQLite, or a managed spatial database may become appropriate later, but
the offset index solves the measured MVP bottleneck while preserving the current provider
and immutable-file boundaries.
