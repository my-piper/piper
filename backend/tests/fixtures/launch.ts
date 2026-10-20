import { toInstance } from "core-kit/packages/transform";
import { Launch } from "models/launch";
import { launchRequestFixture, pipelineFixture } from "./pipeline";

export const EXECUTION_TIME = new Date("2026-01-02T03:04:05.000Z");

export function launchFixture() {
  const pipeline = pipelineFixture();
  return toInstance(
    {
      _id: "launch-test",
      launchedAt: "2026-01-02T03:04:00.000Z",
      launchedBy: { _id: "user-test" },
      project: { _id: "project-test", title: "Test project" },
      options: { notify: true },
      scope: { id: "scope-test", activated: true, maxConcurrent: 1 },
      pipeline: {
        ...pipeline,
        flows: {
          result_flow: {
            from: "echo_node",
            output: "result",
            to: "sink_node",
            input: "value",
            mode: "wait",
          },
        },
        nodes: {
          ...pipeline.nodes,
          sink_node: {
            title: "Sink",
            execution: "regular",
            script: "function run() {}",
            inputs: { value: { type: "json", title: "Value", required: true } },
            outputs: {},
          },
        },
      },
      launchRequest: launchRequestFixture(),
    },
    Launch
  );
}
