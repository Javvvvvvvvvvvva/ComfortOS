# State Archive Checkpoints

This directory contains small, Git-tracked proofs for state datasets that have been copied
to immutable object storage and verified byte-for-byte with SHA-256.

A checkpoint may be written only after:

1. every planned state partition is present and its local checksums pass;
2. accepted live and controlled route reports pass with managed routing and the private
   Overture query provider;
3. every remote object is downloaded and matches its local size and SHA-256; and
4. the remote state archive manifest is published last and verified.

The nationwide rollout and audit commands treat a valid checkpoint as completed work even
after local files are pruned. Checkpoints do not activate production coverage or deploy the
dataset.
