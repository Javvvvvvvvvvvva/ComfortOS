# ADR-026 - State Archive and Local Pruning

Date: 2026-09-03
Status: Accepted

## Context

The nationwide Overture plan contains 20,758 state-partition assignments. The first 39
completed assignments occupy about 1.54 GB, while the workstation has only about 10 GiB
free. Keeping every completed state locally until nationwide deployment would exhaust the
build machine long before all jurisdictions were ready. Committing the generated stores to
Git would also mix source control with hundreds of gigabytes of immutable data.

## Decision

Use a state-by-state archival lifecycle:

1. complete every planned partition for one jurisdiction;
2. pass local manifest, geometry, count, random-access-index, and checksum audits;
3. pass accepted live and controlled route comparisons through managed routing and the
   private Overture query provider;
4. upload immutable partition objects to Cloudflare R2 through its S3-compatible API;
5. download every newly uploaded object and verify its exact size and SHA-256;
6. publish and verify the state archive manifest last;
7. write a small Git-tracked state checkpoint; and
8. prune local state data only with an explicit `<STATE>@<RELEASE>` confirmation.

Large files use multipart uploads. An existing object is reused only when its bytes match;
an existing key with different content is an immutable conflict and stops the run. The
remote manifest is the completion marker, while the Git checkpoint is the durable input to
the nationwide audit and next-work selector.

Archival is not deployment. No production active-region manifest is changed until all 50
states and the District of Columbia have completed the nationwide acceptance process.

## Consequences

- Source code, state plans, validation fixtures, and compact progress proofs remain in Git.
- Generated Overture payloads live in purpose-built object storage rather than Git history.
- Interrupted uploads can resume without overwriting verified immutable objects.
- A locally pruned state remains complete and is not downloaded again by the rollout runner.
- R2 credentials remain server-side environment variables and are not included in logs,
  manifests, checkpoints, or browser code.
- The workstation must still have enough temporary capacity for the largest single state.
  Partition-at-a-time archival and remote validation remain a future option if that peak
  also exceeds available scratch space.

## Alternatives Considered

### Commit State Data Directly to Git

Rejected because ordinary Git is poorly suited to very large generated datasets and would
make clone, fetch, retention, and history management increasingly expensive.

### Keep Every State on the Build Machine

Rejected because cumulative nationwide storage exceeds the available local capacity.

### Delete Local Data Immediately After Upload

Rejected because a successful upload response alone is not sufficient proof. Local pruning
is permitted only after remote byte verification and checkpoint publication.
