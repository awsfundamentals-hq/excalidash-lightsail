import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const scriptsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");

export interface UserDataValues {
  hostname: string;
  bucketName: string;
  region: string;
  excalidashVersion: string;
  frontendImage?: string;
  backupRetentionDays: number;
}

interface InstanceFile {
  source: string;
  target: string;
  mode: string;
}

const INSTANCE_FILES: InstanceFile[] = [
  {
    source: join(assetsDir, "docker-compose.yml"),
    target: "/opt/excalidash/docker-compose.yml",
    mode: "0644",
  },
  { source: join(assetsDir, "Caddyfile"), target: "/opt/excalidash/Caddyfile", mode: "0644" },
  {
    source: join(assetsDir, "fetch-secrets.sh"),
    target: "/opt/excalidash/bin/fetch-secrets.sh",
    mode: "0750",
  },
  {
    source: join(assetsDir, "backup-sync.sh"),
    target: "/opt/excalidash/bin/backup-sync.sh",
    mode: "0750",
  },
  { source: join(scriptsDir, "update.sh"), target: "/opt/excalidash/bin/update.sh", mode: "0750" },
  {
    source: join(assetsDir, "excalidash-secrets.service"),
    target: "/etc/systemd/system/excalidash-secrets.service",
    mode: "0644",
  },
  {
    source: join(assetsDir, "excalidash.service"),
    target: "/etc/systemd/system/excalidash.service",
    mode: "0644",
  },
  {
    source: join(assetsDir, "excalidash-backup.cron"),
    target: "/etc/cron.d/excalidash-backup",
    mode: "0644",
  },
];

const TOKEN_PATTERN = /__[A-Z_]+__/g;
const BOOTSTRAP_PATH = "/usr/local/sbin/excalidash-bootstrap.sh";
const BOOTSTRAP_MARKER = "EXCALIDASH_BOOTSTRAP_EOF";
const MAX_LOCAL_RETENTION_DAYS = 14;

export const localRetentionDays = (bucketRetentionDays: number): number =>
  Math.min(MAX_LOCAL_RETENTION_DAYS, bucketRetentionDays);

const substitute = (text: string, values: UserDataValues): string =>
  text
    .replaceAll("__HOSTNAME__", values.hostname)
    .replaceAll("__BUCKET__", values.bucketName)
    .replaceAll("__REGION__", values.region)
    .replaceAll(
      "__FRONTEND_IMAGE__",
      values.frontendImage ?? `zimengxiong/excalidash-frontend:${values.excalidashVersion}`,
    )
    .replaceAll("__VERSION__", values.excalidashVersion)
    .replaceAll("__LOCAL_RETENTION_DAYS__", String(localRetentionDays(values.backupRetentionDays)))
    .replaceAll("__RETENTION_DAYS__", String(values.backupRetentionDays));

const heredocBlock = (file: InstanceFile, content: string): string => {
  const marker = "EXCALIDASH_FILE_EOF";
  if (content.includes(marker)) throw new Error(`${file.source} contains the heredoc marker`);
  return [
    `install -d -m 0755 "$(dirname ${file.target})"`,
    `cat > ${file.target} <<'${marker}'`,
    content.endsWith("\n") ? content.slice(0, -1) : content,
    marker,
    `chmod ${file.mode} ${file.target}`,
    "",
  ].join("\n");
};

/*
  Lightsail prepends its own #!/bin/sh script to the user data, so our shebang
  becomes a comment and dash runs everything. The wrapper stays POSIX and hands
  the real script to bash.
*/
const wrapForLightsail = (bashScript: string): string => {
  if (bashScript.includes(BOOTSTRAP_MARKER)) {
    throw new Error("bootstrap.sh contains the wrapper heredoc marker");
  }
  return [
    "#!/bin/sh",
    `cat > ${BOOTSTRAP_PATH} <<'${BOOTSTRAP_MARKER}'`,
    bashScript.endsWith("\n") ? bashScript.slice(0, -1) : bashScript,
    BOOTSTRAP_MARKER,
    `chmod 0700 ${BOOTSTRAP_PATH}`,
    `exec /bin/bash ${BOOTSTRAP_PATH}`,
    "",
  ].join("\n");
};

export const renderUserData = (values: UserDataValues): string => {
  const bootstrap = readFileSync(join(assetsDir, "bootstrap.sh"), "utf8");
  const files = INSTANCE_FILES.map((file) =>
    heredocBlock(file, substitute(readFileSync(file.source, "utf8"), values)),
  ).join("\n");
  const rendered = substitute(bootstrap.replace("# __FILES__", files), values);

  const leftover = rendered.match(TOKEN_PATTERN);
  if (leftover) {
    throw new Error(`Unreplaced user-data tokens: ${[...new Set(leftover)].join(", ")}`);
  }
  return wrapForLightsail(rendered);
};
