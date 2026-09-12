#!/bin/bash
set -euo pipefail

BUCKET="__BUCKET__"
REGION="__REGION__"
RETENTION_DAYS="${RETENTION_DAYS:-__RETENTION_DAYS__}"
DRY_RUN="${DRY_RUN:-0}"
SOURCE_DIR="/opt/excalidash/data/backups"
PREFIX="backups/"
LOG="/var/log/excalidash-backup.log"

log() { echo "$(date -u +%FT%TZ) $*" | tee -a "${LOG}"; }

sync_args=(--region "${REGION}" --exclude "*" --include "excalidash-sqlite-*.db")
[ "${DRY_RUN}" = "1" ] && sync_args+=(--dryrun)
aws s3 sync "${SOURCE_DIR}" "s3://${BUCKET}/${PREFIX}" "${sync_args[@]}"
log "synced ${SOURCE_DIR} to s3://${BUCKET}/${PREFIX}"

cutoff=$(date -u -d "${RETENTION_DAYS} days ago" +%s)
listing=$(aws s3 ls "s3://${BUCKET}/${PREFIX}" --region "${REGION}" || true)
while read -r day time _size name; do
  [ -z "${name:-}" ] && continue
  modified=$(date -u -d "${day} ${time}" +%s)
  [ "${modified}" -ge "${cutoff}" ] && continue
  if [ "${DRY_RUN}" = "1" ]; then
    log "would delete ${PREFIX}${name}"
  else
    aws s3 rm "s3://${BUCKET}/${PREFIX}${name}" --region "${REGION}" >/dev/null
    log "deleted ${PREFIX}${name}"
  fi
done <<<"${listing}"
log "prune complete, retention ${RETENTION_DAYS} days"
