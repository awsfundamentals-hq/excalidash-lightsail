#!/bin/bash
set -euo pipefail
exec > >(tee -a /var/log/excalidash-bootstrap.log) 2>&1
echo "[bootstrap] start $(date -u +%FT%TZ)"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg awscli sqlite3

install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.asc ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker ubuntu

install -d -m 0755 /opt/excalidash /opt/excalidash/bin
install -d -m 0700 /opt/excalidash/data/prisma /opt/excalidash/data/backups
install -d -m 0755 /opt/excalidash/caddy/data /opt/excalidash/caddy/config

# __FILES__

systemctl daemon-reload
systemctl enable docker excalidash-secrets.service excalidash.service
systemctl start excalidash-secrets.service
systemctl start excalidash.service

echo "[bootstrap] complete $(date -u +%FT%TZ)"
