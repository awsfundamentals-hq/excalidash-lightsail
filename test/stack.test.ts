import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../lib/config.js";
import { ExcalidashLightsailStack } from "../lib/stack.js";

describe("ExcalidashLightsailStack", () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new ExcalidashLightsailStack(app, "Test", {
      config: loadConfig(() => undefined),
      env: { account: "123456789012", region: "eu-central-1" },
    });
    template = Template.fromStack(stack);
  });

  it("creates one Ubuntu micro instance in eu-central-1a with daily snapshots", () => {
    template.resourceCountIs("AWS::Lightsail::Instance", 1);
    template.hasResourceProperties("AWS::Lightsail::Instance", {
      InstanceName: "excalidash",
      BlueprintId: "ubuntu_24_04",
      BundleId: "micro_3_0",
      AvailabilityZone: "eu-central-1a",
      AddOns: [
        { AddOnType: "AutoSnapshot", AutoSnapshotAddOnRequest: { SnapshotTimeOfDay: "03:00" } },
      ],
      Tags: Match.arrayWith([{ Key: "project", Value: "excalidash" }]),
    });
  });

  it("opens exactly ports 22, 80 and 443 to the world", () => {
    const [instance] = Object.values(template.findResources("AWS::Lightsail::Instance"));
    const ports = instance?.Properties.Networking.Ports as Array<{
      FromPort: number;
      ToPort: number;
      Cidrs: string[];
      Ipv6Cidrs: string[];
      Protocol: string;
    }>;
    expect(ports.map((p) => p.FromPort).sort((a, b) => a - b)).toEqual([22, 80, 443]);
    for (const port of ports) {
      expect(port.ToPort).toBe(port.FromPort);
      expect(port.Protocol).toBe("tcp");
      expect(port.Cidrs).toEqual(["0.0.0.0/0"]);
      expect(port.Ipv6Cidrs).toEqual(["::/0"]);
    }
  });

  it("attaches a static IP to the instance", () => {
    template.hasResourceProperties("AWS::Lightsail::StaticIp", {
      StaticIpName: "excalidash-ip",
      AttachedTo: "excalidash",
    });
  });

  it("creates a private, retained bucket the instance can access without keys", () => {
    template.hasResource("AWS::Lightsail::Bucket", {
      DeletionPolicy: "Retain",
      Properties: {
        BucketName: "excalidash-123456789012",
        BundleId: "small_1_0",
        ObjectVersioning: false,
        AccessRules: { GetObject: "private", AllowPublicOverrides: false },
        ResourcesReceivingAccess: ["excalidash"],
      },
    });
  });

  it("creates a status-check alarm and a CPU alarm that email on ALARM and OK", () => {
    template.resourceCountIs("AWS::Lightsail::Alarm", 2);
    template.hasResourceProperties("AWS::Lightsail::Alarm", {
      AlarmName: "excalidash-status-check",
      MetricName: "StatusCheckFailed_Instance",
      MonitoredResourceName: "excalidash",
      ComparisonOperator: "GreaterThanOrEqualToThreshold",
      Threshold: 1,
      EvaluationPeriods: 2,
      TreatMissingData: "breaching",
      ContactProtocols: ["Email"],
      NotificationTriggers: ["ALARM", "OK"],
      NotificationEnabled: true,
    });
    template.hasResourceProperties("AWS::Lightsail::Alarm", {
      AlarmName: "excalidash-cpu",
      MetricName: "CPUUtilization",
      Threshold: 90,
      EvaluationPeriods: 3,
    });
  });

  it("passes the bucket name and hostname into the user data", () => {
    const [instance] = Object.values(template.findResources("AWS::Lightsail::Instance"));
    const userData = instance?.Properties.UserData as string;
    expect(userData).toContain('BUCKET="excalidash-123456789012"');
    expect(userData).toContain("draw.awsfundamentals.com {");
  });

  it("exposes the five documented outputs", () => {
    const outputs = template.findOutputs("*");
    expect(Object.keys(outputs).sort()).toEqual(
      ["BucketName", "Hostname", "InstanceName", "PublicIp", "SshCommand"].sort(),
    );
  });
});
