#!/bin/bash
set -euo pipefail

BUCKET="__BUCKET__"
REGION="__REGION__"
KEY="secrets.env"
TARGET="/opt/excalidash/secrets.env"
OBJECT="s3://${BUCKET}/${KEY}"
ATTEMPTS=40
SLEEP_SECONDS=15

wait_for_bucket() {
  for attempt in $(seq 1 "${ATTEMPTS}"); do
    if aws s3api head-bucket --bucket "${BUCKET}" --region "${REGION}" >/dev/null 2>&1; then
      return 0
    fi
    echo "[secrets] bucket ${BUCKET} not reachable yet (attempt ${attempt}/${ATTEMPTS})"
    sleep "${SLEEP_SECONDS}"
  done
  return 1
}

umask 077
if ! wait_for_bucket; then
  echo "[secrets] bucket ${BUCKET} unreachable after $((ATTEMPTS * SLEEP_SECONDS)) seconds" >&2
  exit 1
fi

if head_error=$(aws s3api head-object --bucket "${BUCKET}" --key "${KEY}" --region "${REGION}" 2>&1 >/dev/null); then
  aws s3 cp "${OBJECT}" "${TARGET}" --region "${REGION}" >/dev/null
  echo "[secrets] downloaded from ${OBJECT}"
elif grep -q "(404)" <<<"${head_error}"; then
  echo "[secrets] no object at ${OBJECT}, generating new secrets"
  {
    echo "JWT_SECRET=$(openssl rand -hex 32)"
    echo "CSRF_SECRET=$(openssl rand -hex 32)"
  } > "${TARGET}"
  aws s3 cp "${TARGET}" "${OBJECT}" --region "${REGION}" >/dev/null
  echo "[secrets] uploaded to ${OBJECT}"
else
  echo "[secrets] cannot check ${OBJECT}: ${head_error}" >&2
  exit 1
fi
chmod 600 "${TARGET}"
