#!/bin/bash
set -euo pipefail
exec > >(tee -a /var/log/excalidash-bootstrap.log) 2>&1
echo "[bootstrap] start $(date -u +%FT%TZ)"

export DEBIAN_FRONTEND=noninteractive
apt_get() { apt-get -o DPkg::Lock::Timeout=300 "$@"; }

if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
swapon -a

install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.asc ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

install -m 0755 -d /etc/docker
cat > /etc/docker/daemon.json <<'DAEMON_JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
DAEMON_JSON

apt_get update -y
apt_get install -y ca-certificates curl unzip sqlite3 docker-ce docker-ce-cli containerd.io docker-compose-plugin

if ! command -v aws >/dev/null 2>&1; then
  awscli_tmp="$(mktemp -d)"
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "${awscli_tmp}/awscliv2.zip"
  unzip -q "${awscli_tmp}/awscliv2.zip" -d "${awscli_tmp}"
  "${awscli_tmp}/aws/install"
  rm -rf "${awscli_tmp}"
fi
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
