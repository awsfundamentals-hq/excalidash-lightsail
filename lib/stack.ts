import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { CfnAlarm, CfnBucket, CfnInstance, CfnStaticIp } from "aws-cdk-lib/aws-lightsail";
import type { Construct } from "constructs";
import { AVAILABILITY_ZONE, REGION, type StackConfig } from "./config.js";
import { renderUserData } from "./user-data.js";

export interface ExcalidashLightsailStackProps extends StackProps {
  config: StackConfig;
}

const PUBLIC_PORTS = [22, 80, 443];
const SNAPSHOT_TIME_OF_DAY = "03:00";
const BUCKET_BUNDLE_ID = "small_1_0";

export class ExcalidashLightsailStack extends Stack {
  constructor(scope: Construct, id: string, props: ExcalidashLightsailStackProps) {
    super(scope, id, props);
    const { config } = props;
    const bucketName = config.bucketName ?? `${config.instanceName}-${this.account}`;
    const tags = [
      { key: "project", value: "excalidash" },
      { key: "managed-by", value: "cdk" },
    ];

    const instance = new CfnInstance(this, "Instance", {
      instanceName: config.instanceName,
      blueprintId: config.blueprintId,
      bundleId: config.bundleId,
      availabilityZone: AVAILABILITY_ZONE,
      userData: renderUserData({
        hostname: config.hostname,
        bucketName,
        region: REGION,
        excalidashVersion: config.excalidashVersion,
        backupRetentionDays: config.backupRetentionDays,
      }),
      addOns: [
        {
          addOnType: "AutoSnapshot",
          autoSnapshotAddOnRequest: { snapshotTimeOfDay: SNAPSHOT_TIME_OF_DAY },
        },
      ],
      networking: {
        ports: PUBLIC_PORTS.map((port) => ({
          fromPort: port,
          toPort: port,
          protocol: "tcp",
          cidrs: ["0.0.0.0/0"],
          ipv6Cidrs: ["::/0"],
        })),
      },
      tags,
    });

    const staticIp = new CfnStaticIp(this, "StaticIp", {
      staticIpName: `${config.instanceName}-ip`,
      attachedTo: instance.instanceName,
    });
    staticIp.addResourceDependency(instance);

    const bucket = new CfnBucket(this, "Bucket", {
      bucketName,
      bundleId: BUCKET_BUNDLE_ID,
      objectVersioning: false,
      accessRules: { objectAccess: "private", allowPublicOverrides: false },
      resourcesReceivingAccess: [instance.instanceName],
      tags,
    });
    bucket.addResourceDependency(instance);
    bucket.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const alarmDefaults = {
      monitoredResourceName: instance.instanceName,
      contactProtocols: ["Email"],
      notificationTriggers: ["ALARM", "OK"],
      notificationEnabled: true,
    };
    const statusAlarm = new CfnAlarm(this, "StatusCheckAlarm", {
      ...alarmDefaults,
      alarmName: `${config.instanceName}-status-check`,
      metricName: "StatusCheckFailed_Instance",
      comparisonOperator: "GreaterThanOrEqualToThreshold",
      threshold: 1,
      evaluationPeriods: 2,
      treatMissingData: "breaching",
    });
    const cpuAlarm = new CfnAlarm(this, "CpuAlarm", {
      ...alarmDefaults,
      alarmName: `${config.instanceName}-cpu`,
      metricName: "CPUUtilization",
      comparisonOperator: "GreaterThanOrEqualToThreshold",
      threshold: 90,
      evaluationPeriods: 3,
      treatMissingData: "notBreaching",
    });
    statusAlarm.addResourceDependency(instance);
    cpuAlarm.addResourceDependency(instance);

    new CfnOutput(this, "PublicIp", { value: staticIp.attrIpAddress });
    new CfnOutput(this, "BucketName", { value: bucketName });
    new CfnOutput(this, "InstanceName", { value: config.instanceName });
    new CfnOutput(this, "Hostname", { value: config.hostname });
    new CfnOutput(this, "AlarmContactCommand", {
      value: `aws lightsail create-contact-method --protocol Email --contact-endpoint ${config.alarmEmail} --region ${REGION}`,
    });
    new CfnOutput(this, "SshCommand", {
      value: `ssh -i ~/.ssh/LightsailDefaultKey-${REGION}.pem ubuntu@${staticIp.attrIpAddress}`,
    });
  }
}
