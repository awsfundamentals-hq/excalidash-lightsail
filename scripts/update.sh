#!/bin/bash
set -euo pipefail

VERSION="${1:-}"
if [ -z "${VERSION}" ]; then
  echo "usage: $0 <excalidash-version>   e.g. $0 0.6.1" >&2
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "run as root: sudo $0 ${VERSION}" >&2
  exit 1
fi

APP_DIR="/opt/excalidash"
COMPOSE="${APP_DIR}/docker-compose.yml"
DB="${APP_DIR}/data/prisma/dev.db"
BACKUP="${APP_DIR}/data/backups/excalidash-sqlite-pre-update-$(date -u +%Y%m%dT%H%M%SZ).db"

echo "[update] backing up ${DB} to ${BACKUP}"
sqlite3 "${DB}" ".backup '${BACKUP}'"
chmod 600 "${BACKUP}"
"${APP_DIR}/bin/backup-sync.sh"

echo "[update] pinning images to ${VERSION}"
sed -i -E "s#(zimengxiong/excalidash-(backend|frontend)):[^[:space:]]+#\1:${VERSION}#g" "${COMPOSE}"

cd "${APP_DIR}"
docker compose pull
docker compose up -d --remove-orphans

echo "[update] waiting for backend health"
for _ in $(seq 1 30); do
  status=$(docker inspect --format '{{.State.Health.Status}}' excalidash-backend 2>/dev/null || echo "missing")
  if [ "${status}" = "healthy" ]; then
    echo "[update] backend healthy"
    docker compose logs --tail=300 backend 2>/dev/null | grep -A14 '| STORAGE' | tail -16 || true
    docker compose images
    exit 0
  fi
  sleep 5
done

echo "[update] backend did not become healthy within 150 seconds" >&2
docker compose logs --tail=50 backend >&2
exit 1
