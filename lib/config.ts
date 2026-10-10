export interface StackConfig {
  hostname: string;
  instanceName: string;
  bundleId: string;
  blueprintId: string;
  excalidashVersion: string;
  backupRetentionDays: number;
  bucketName?: string;
}

export const REGION = "eu-central-1";
export const AVAILABILITY_ZONE = `${REGION}a`;

const DEFAULTS: StackConfig = {
  hostname: "draw.awsfundamentals.com",
  instanceName: "excalidash",
  bundleId: "micro_3_0",
  blueprintId: "ubuntu_24_04",
  excalidashVersion: "0.6.0",
  backupRetentionDays: 30,
};

const HOSTNAME_PATTERN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/;

type ContextReader = (key: string) => unknown;

const readString = (read: ContextReader, key: keyof StackConfig, fallback: string): string => {
  const value = read(key);
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") throw new Error(`Context "${key}" must be a string`);
  return value;
};

const readNumber = (read: ContextReader, key: keyof StackConfig, fallback: number): number => {
  const value = read(key);
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Context "${key}" must be a non-negative integer`);
  }
  return parsed;
};

export const loadConfig = (read: ContextReader): StackConfig => {
  const config: StackConfig = {
    hostname: readString(read, "hostname", DEFAULTS.hostname),
    instanceName: readString(read, "instanceName", DEFAULTS.instanceName),
    bundleId: readString(read, "bundleId", DEFAULTS.bundleId),
    blueprintId: readString(read, "blueprintId", DEFAULTS.blueprintId),
    excalidashVersion: readString(read, "excalidashVersion", DEFAULTS.excalidashVersion),
    backupRetentionDays: readNumber(read, "backupRetentionDays", DEFAULTS.backupRetentionDays),
  };
  const bucketName = read("bucketName");
  if (typeof bucketName === "string" && bucketName !== "") config.bucketName = bucketName;

  if (!HOSTNAME_PATTERN.test(config.hostname)) {
    throw new Error(
      `Context "hostname" must be a bare fully qualified domain name, got "${config.hostname}"`,
    );
  }
  if (!VERSION_PATTERN.test(config.excalidashVersion)) {
    throw new Error(
      `Context "excalidashVersion" must look like 0.6.0, got "${config.excalidashVersion}"`,
    );
  }
  return config;
};
