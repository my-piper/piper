import { DEPLOY } from "consts/redis";
import redis from "core-kit/packages/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { NodeExecution } from "enums/node-execution";
import { Deploy } from "models/deploy";
import { Launch } from "models/launch";
import { NodeOutput } from "models/node";
import { randomUUID } from "node:crypto";
import { launchFixture } from "../fixtures/launch";

export const DEPLOY_PREFIX = "deploys-test";

export function pipelineLaunch() {
  const source = launchFixture();
  source.scope = {
    id: `scope-${randomUUID()}`,
    activated: false,
    maxConcurrent: 1,
  };
  source.options = { notify: false };
  source.pipeline.nodes.get("echo_node").script =
    "function run() { /* echo */ }";
  const sink = source.pipeline.nodes.get("sink_node");
  sink.script = "function run() { /* sink */ }";
  sink.execution = NodeExecution.rapid;
  sink.outputs = new Map([
    ["result", toInstance({ type: "json", title: "Result" }, NodeOutput)],
  ]);
  source.pipeline.outputs.get("result").flows.get("result_flow").from =
    "sink_node";
  return source;
}

// publishes the launch's pipeline as an unscoped Deploy a node can start a
// Child Launch from
export async function publishDeploy(source: Launch = pipelineLaunch()) {
  const slug = `child-${randomUUID()}`;
  const deploy = new Deploy({
    _id: `deploy-${slug}`,
    deployedAt: new Date(),
    prefix: DEPLOY_PREFIX,
    slug,
    project: source.project,
    pipeline: source.pipeline,
    launchRequest: source.launchRequest,
  });
  await redis.set(DEPLOY(slug, DEPLOY_PREFIX), JSON.stringify(toPlain(deploy)));
  return deploy;
}
