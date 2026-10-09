import { App } from "aws-cdk-lib";
import { loadConfig, REGION } from "../lib/config.js";
import { ExcalidashLightsailStack } from "../lib/stack.js";

const app = new App();
const config = loadConfig((key) => app.node.tryGetContext(key));

new ExcalidashLightsailStack(app, "ExcalidashLightsail", {
  config,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: REGION },
  description: "ExcaliDash on one Lightsail instance: static IP, bucket, snapshots, alarms",
});
