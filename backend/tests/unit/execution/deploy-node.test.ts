import {
  doubles,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME, launchFixture } from "../../fixtures/launch";
import { pipelineFixture } from "../../fixtures/pipeline";
import {
  DEPLOY,
  LAUNCH,
  LAUNCH_EXPIRED,
  NODE_CHILDREN,
  NODE_OUTPUTS,
  PIPELINE_OUTPUT,
} from "consts/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { FatalError } from "core-kit/types/errors";
import { DelayedError } from "bullmq";
import { Node, NodeInput } from "models/node";
import { plan } from "packages/nodes/plan-node";
import { beforeEach, describe, expect, it, vi } from "vitest";

let context: ReturnType<typeof nodeExecutionFixture>;

function deployFixture(pipeline: object = pipelineFixture()) {
  return {
    _id: "user-test_child",
    prefix: "user-test",
    slug: "child",
    project: { _id: "project-child", title: "Child project" },
    pipeline,
    launchRequest: { inputs: { enabled: true, count: 1, text: "deployed" } },
  };
}

function runsDeploy() {
  const node = context.launch.pipeline.nodes.get("echo_node");
  node.source = "deploy";
  node.deploy = { prefix: "user-test", slug: "child" };
  node.script = undefined;
  return node;
}

function startedChild(output: string | null) {
  const child = launchFixture();
  child._id = "child-1";
  context.responses.set(
    NODE_CHILDREN(context.launch._id, "echo_node"),
    JSON.stringify({ deploy: "child-1" })
  );
  context.responses.set(LAUNCH("child-1"), JSON.stringify(toPlain(child)));
  if (output !== null) {
    context.responses.set(PIPELINE_OUTPUT("child-1", "result"), output);
  }
}

beforeEach(() => {
  resetExecutionDoubles();
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
  context = nodeExecutionFixture();
  context.responses.set(
    DEPLOY("child", "user-test"),
    JSON.stringify(deployFixture())
  );
});

describe("deploy nodes", () => {
  it("start their Deploy as a child with the node's inputs, without Deno", async () => {
    runsDeploy();

    await expect(context.run()).rejects.toBeInstanceOf(DelayedError);

    expect(doubles.execute).not.toHaveBeenCalled();
    const child = doubles.insertOne.mock.calls[0][0] as Record<string, unknown>;
    expect(child).toMatchObject({
      parent: context.launch._id,
      project: { _id: "project-child" },
      launchRequest: { inputs: { count: 0 } },
    });
    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      NODE_CHILDREN(context.launch._id, "echo_node"),
      LAUNCH_EXPIRED,
      JSON.stringify({ deploy: child["_id"] })
    );
    expect(context.job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(
      EXECUTION_TIME.getTime() + 3000
    );
  });

  it("wait while their child runs", async () => {
    runsDeploy();
    startedChild(null);

    await expect(context.run()).rejects.toBeInstanceOf(DelayedError);

    expect(doubles.insertOne).not.toHaveBeenCalled();
    expect(context.job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(
      EXECUTION_TIME.getTime() + 3000
    );
  });

  it("pass on the outputs of their finished child", async () => {
    runsDeploy();
    startedChild('{"answer":42}');

    await context.run();

    expect(doubles.execute).not.toHaveBeenCalled();
    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      NODE_OUTPUTS(context.launch._id, "echo_node"),
      LAUNCH_EXPIRED,
      JSON.stringify({ result: JSON.stringify({ answer: 42 }, null, "  ") })
    );
  });

  it("fail without retries when the Deploy is gone", async () => {
    runsDeploy();
    context.responses.delete(DEPLOY("child", "user-test"));

    const run = context.run();

    await expect(run).rejects.toBeInstanceOf(FatalError);
    await expect(run).rejects.toThrow("Deploy child is not found");
    expect(doubles.insertOne).not.toHaveBeenCalled();
  });

  it("fail without retries when their sockets no longer match the Deploy", async () => {
    const node = runsDeploy();
    node.inputs.set(
      "extra",
      toInstance({ type: "string", title: "Extra" }, NodeInput)
    );
    const pipeline = pipelineFixture();
    pipeline.inputs["topic"] = { type: "string", required: true };
    pipeline.outputs = { summary: { type: "string", flows: {} } } as never;
    context.responses.set(
      DEPLOY("child", "user-test"),
      JSON.stringify(deployFixture(pipeline))
    );

    const run = context.run();

    await expect(run).rejects.toBeInstanceOf(FatalError);
    await expect(run).rejects.toThrow(
      "The Node no longer matches Deploy child (input extra is gone, required input topic is missing, output result is gone): refresh it from the Deploy"
    );
    expect(doubles.insertOne).not.toHaveBeenCalled();
  });

  it("are planned on the rapid queue whatever their execution says", async () => {
    const node = toInstance(
      { source: "deploy", execution: "protracted" },
      Node
    );

    await plan("echo_node", node, "launch-1");

    expect(doubles.plans.rapid).toHaveBeenCalledExactlyOnceWith(
      { launch: "launch-1", node: "echo_node" },
      {}
    );
    expect(doubles.plans.protracted).not.toHaveBeenCalled();
  });
});
