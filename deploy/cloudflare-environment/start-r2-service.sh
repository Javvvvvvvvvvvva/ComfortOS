#!/bin/sh
set -eu

: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required}"
: "${R2_BUCKET_NAME:?R2_BUCKET_NAME is required}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required}"
: "${ENVIRONMENT_DEPLOYMENT_STORE_ROOT:?ENVIRONMENT_DEPLOYMENT_STORE_ROOT is required}"

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
/usr/local/bin/tigrisfs \
  --endpoint "${R2_ENDPOINT}" \
  -o allow_other,ro \
  -f "${R2_BUCKET_NAME}" \
  /mnt/r2 >/tmp/tigrisfs.log 2>&1 &
TIGRISFS_PID=$!

attempt=0
while [ "${attempt}" -lt 30 ]; do
  if ! kill -0 "${TIGRISFS_PID}" 2>/dev/null; then
    echo "R2 read-only mount failed." >&2
    exit 1
  fi
  if [ -d "${ENVIRONMENT_DEPLOYMENT_STORE_ROOT}/us" ]; then
    exec su-exec node node /app/service.mjs
  fi
  attempt=$((attempt + 1))
  sleep 1
done

echo "R2 read-only mount did not become ready." >&2
exit 1
