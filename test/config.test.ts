import { describe, expect, it } from "vitest";
import { loadConfig } from "../lib/config.js";

const reader = (values: Record<string, unknown>) => (key: string) => values[key];

describe("loadConfig", () => {
  it("returns the defaults when no context is set", () => {
    const config = loadConfig(reader({}));
    expect(config).toMatchObject({
      hostname: "draw.awsfundamentals.com",
      bundleId: "micro_3_0",
      blueprintId: "ubuntu_24_04",
      excalidashVersion: "0.6.5",
      backupRetentionDays: 30,
    });
    expect(config.bucketName).toBeUndefined();
    expect(config.frontendImage).toBeUndefined();
  });

  it("applies context overrides", () => {
    const config = loadConfig(
      reader({ hostname: "test.example.com", backupRetentionDays: "7", bucketName: "my-bucket" }),
    );
    expect(config.hostname).toBe("test.example.com");
    expect(config.backupRetentionDays).toBe(7);
    expect(config.bucketName).toBe("my-bucket");
  });

  it("rejects a hostname with a scheme", () => {
    expect(() => loadConfig(reader({ hostname: "https://draw.example.com" }))).toThrow(/hostname/);
  });

  it("rejects a version that is not semver-like", () => {
    expect(() => loadConfig(reader({ excalidashVersion: "latest" }))).toThrow(/excalidashVersion/);
  });

  it("accepts a frontend image with a tag", () => {
    const image = "ghcr.io/awsfundamentals-hq/excalidash-frontend:0.6.5-libsearch.1";
    expect(loadConfig(reader({ frontendImage: image })).frontendImage).toBe(image);
  });

  it("rejects a frontend image without a tag", () => {
    expect(() =>
      loadConfig(reader({ frontendImage: "ghcr.io/awsfundamentals-hq/excalidash-frontend" })),
    ).toThrow(/frontendImage/);
  });

  it("rejects a negative retention", () => {
    expect(() => loadConfig(reader({ backupRetentionDays: -1 }))).toThrow(/backupRetentionDays/);
  });
});
