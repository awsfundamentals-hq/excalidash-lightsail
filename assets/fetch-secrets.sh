#!/bin/bash
set -euo pipefail

BUCKET="__BUCKET__"
REGION="__REGION__"
TARGET="/opt/excalidash/secrets.env"
OBJECT="s3://${BUCKET}/secrets.env"

umask 077
if aws s3 cp "${OBJECT}" "${TARGET}" --region "${REGION}" >/dev/null 2>&1; then
  echo "[secrets] downloaded from ${OBJECT}"
else
  echo "[secrets] no object at ${OBJECT}, generating new secrets"
  {
    echo "JWT_SECRET=$(openssl rand -hex 32)"
    echo "CSRF_SECRET=$(openssl rand -hex 32)"
  } > "${TARGET}"
  aws s3 cp "${TARGET}" "${OBJECT}" --region "${REGION}" >/dev/null
  echo "[secrets] uploaded to ${OBJECT}"
fi
chmod 600 "${TARGET}"
