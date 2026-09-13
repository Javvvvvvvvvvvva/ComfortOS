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
while [ "${attempt}" -lt 60 ]; do
  if ! kill -0 "${TIGRISFS_PID}" 2>/dev/null; then
    echo "R2 read-only mount failed." >&2
    exit 1
  fi
  if [ -d "${ENVIRONMENT_DEPLOYMENT_STORE_ROOT}/us" ] \
    && node /app/probe-r2-mount.mjs >/dev/null 2>&1; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done

if [ "${attempt}" -ge 60 ]; then
  echo "R2 read-only mount did not become ready." >&2
  kill "${TIGRISFS_PID}" 2>/dev/null || true
  wait "${TIGRISFS_PID}" 2>/dev/null || true
  exit 1
fi

su-exec node node /app/service.mjs &
SERVICE_PID=$!

shutdown() {
  trap - INT TERM
  kill "${SERVICE_PID}" "${TIGRISFS_PID}" 2>/dev/null || true
  wait "${SERVICE_PID}" 2>/dev/null || true
  wait "${TIGRISFS_PID}" 2>/dev/null || true
  exit 0
}

trap shutdown INT TERM

while kill -0 "${SERVICE_PID}" 2>/dev/null \
  && kill -0 "${TIGRISFS_PID}" 2>/dev/null; do
  sleep 1
done

if ! kill -0 "${TIGRISFS_PID}" 2>/dev/null; then
  echo "R2 read-only mount stopped unexpectedly." >&2
  kill "${SERVICE_PID}" 2>/dev/null || true
  wait "${SERVICE_PID}" 2>/dev/null || true
  exit 1
fi

set +e
wait "${SERVICE_PID}"
status=$?
set -e
kill "${TIGRISFS_PID}" 2>/dev/null || true
wait "${TIGRISFS_PID}" 2>/dev/null || true
exit "${status}"
