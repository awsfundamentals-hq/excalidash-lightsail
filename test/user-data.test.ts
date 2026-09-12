import { describe, expect, it } from "vitest";
import { renderUserData } from "../lib/user-data.js";

const values = {
  hostname: "test.example.com",
  bucketName: "excalidash-123456789012",
  region: "eu-central-1",
  excalidashVersion: "0.6.0",
  backupRetentionDays: 30,
};

describe("renderUserData", () => {
  const script = renderUserData(values);

  it("starts with a bash shebang and strict mode", () => {
    expect(script.startsWith("#!/bin/bash\nset -euo pipefail")).toBe(true);
  });

  it("pins both ExcaliDash images to the configured version", () => {
    expect(script).toContain("zimengxiong/excalidash-backend:0.6.0");
    expect(script).toContain("zimengxiong/excalidash-frontend:0.6.0");
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

  it("leaves no placeholder tokens behind", () => {
    const tokens = (script.match(/__[A-Z_]+__/g) ?? []).filter((t) => t !== "__BACKEND_URL__");
    expect(tokens).toEqual([]);
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
