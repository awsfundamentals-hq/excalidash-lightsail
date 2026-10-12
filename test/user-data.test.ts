import { describe, expect, it } from "vitest";
import { localRetentionDays, renderUserData } from "../lib/user-data.js";

const values = {
  hostname: "test.example.com",
  bucketName: "excalidash-123456789012",
  region: "eu-central-1",
  excalidashVersion: "0.6.0",
  backupRetentionDays: 30,
};

describe("renderUserData", () => {
  const script = renderUserData(values);

  it("survives the Lightsail sh prefix by handing a strict bash script to bash", () => {
    const lightsailPrefix = "#!/bin/sh\necho Lightsail: Starting Instance Initialization.\n\n";
    const lines = (lightsailPrefix + script).split("\n");
    const firstOwnLine = lines.indexOf("#!/bin/sh", 1);
    expect(lines[firstOwnLine + 1]).toBe(
      "cat > /usr/local/sbin/excalidash-bootstrap.sh <<'EXCALIDASH_BOOTSTRAP_EOF'",
    );
    expect(lines[firstOwnLine + 2]).toBe("#!/bin/bash");
    expect(lines[firstOwnLine + 3]).toBe("set -euo pipefail");
    expect(
      script.trimEnd().endsWith("exec /bin/bash /usr/local/sbin/excalidash-bootstrap.sh"),
    ).toBe(true);
  });

  it("pins both ExcaliDash images to the configured version", () => {
    expect(script).toContain("zimengxiong/excalidash-backend:0.6.0");
    expect(script).toContain("zimengxiong/excalidash-frontend:0.6.0");
  });

  it("uses the frontend image override and keeps the backend on the configured version", () => {
    const image = "ghcr.io/awsfundamentals-hq/excalidash-frontend:0.6.0-libsearch.1";
    const custom = renderUserData({ ...values, frontendImage: image });
    expect(custom).toContain(`image: ${image}`);
    expect(custom).toContain("zimengxiong/excalidash-backend:0.6.0");
    expect(custom).not.toContain("image: zimengxiong/excalidash-frontend");
  });

  it("writes the hostname into the Caddyfile and FRONTEND_URL", () => {
    expect(script).toContain("test.example.com {");
    expect(script).toContain("FRONTEND_URL=https://test.example.com");
  });

  it("points the secrets and backup scripts at the bucket and region", () => {
    expect(script).toContain('BUCKET="excalidash-123456789012"');
    expect(script).toContain('REGION="eu-central-1"');
    expect(script).toContain('RETENTION_DAYS="${RETENTION_DAYS:-30}"');
  });

  it("keeps local retention at or below 14 days and never above the bucket retention", () => {
    expect(localRetentionDays(30)).toBe(14);
    expect(localRetentionDays(7)).toBe(7);
    expect(script).toContain("BACKUP_RETENTION_DAYS=14");
    expect(renderUserData({ ...values, backupRetentionDays: 7 })).toContain(
      "BACKUP_RETENTION_DAYS=7",
    );
  });

  it("configures Docker log rotation, swap, and an apt lock timeout before installing", () => {
    expect(script).toContain('"max-size": "10m"');
    expect(script).toContain("fallocate -l 1G /swapfile");
    expect(script).toContain("DPkg::Lock::Timeout=300");
    expect(script.indexOf("/etc/docker/daemon.json")).toBeLessThan(
      script.indexOf("apt_get install"),
    );
  });

  it("installs AWS CLI v2 from the official installer, not apt", () => {
    expect(script).not.toMatch(/apt_get install[^\n]*\bawscli\b/);
    expect(script).toContain("https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip");
  });

  it("sends X-Forwarded-Proto in the health check so the HTTPS redirect does not fail it", () => {
    expect(script).toContain(
      "'http://127.0.0.1:8000/health', { headers: { 'X-Forwarded-Proto': 'https' } }",
    );
  });

  it("leaves no placeholder tokens behind", () => {
    expect(script.match(/__[A-Z_]+__/g) ?? []).toEqual([]);
  });

  it("installs every instance file with a mode", () => {
    for (const target of [
      "/opt/excalidash/docker-compose.yml",
      "/opt/excalidash/Caddyfile",
      "/opt/excalidash/bin/fetch-secrets.sh",
      "/opt/excalidash/bin/backup-sync.sh",
      "/opt/excalidash/bin/update.sh",
      "/etc/systemd/system/excalidash-secrets.service",
      "/etc/systemd/system/excalidash.service",
      "/etc/cron.d/excalidash-backup",
    ]) {
      expect(script).toContain(`cat > ${target} <<'EXCALIDASH_FILE_EOF'`);
      expect(script).toMatch(new RegExp(`chmod 0[0-7]{3} ${target.replaceAll("/", "\\/")}`));
    }
  });
});
