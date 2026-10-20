import { toInstance } from "core-kit/packages/transform";
import { NodeExecution } from "enums/node-execution";
import { NodeOutput } from "models/node";
import { randomUUID } from "node:crypto";
import { launchFixture } from "../fixtures/launch";

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
