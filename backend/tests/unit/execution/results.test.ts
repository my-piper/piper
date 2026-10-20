import {
  doubles,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME } from "../../fixtures/launch";
import {
  LAUNCH_EXPIRED,
  NODE_FLOWS,
  NODE_INPUT,
  NODE_OUTPUTS,
  NODE_PROCESSED_LOCK,
  NODE_PROGRESS,
  NODE_STATE,
  NODE_STATUS,
  PIPELINE_OUTPUT,
} from "consts/redis";
import { DelayedError } from "bullmq";
import { NodeJobResult } from "types/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

let context: ReturnType<typeof nodeExecutionFixture>;

beforeEach(() => {
  resetExecutionDoubles();
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
  context = nodeExecutionFixture();
});

describe("node results and scheduling", () => {
  it("persists successful outputs, fills downstream inputs, and finishes the pipeline", async () => {
    const json = JSON.stringify({ enabled: false, count: 0 }, null, "  ");

    const result = await context.run();

    expect(result).toBe(NodeJobResult.NODE_PROCESSED);
    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      NODE_STATUS(context.launch._id, "echo_node"),
      LAUNCH_EXPIRED,
      '{"state":"done"}'
    );
    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      NODE_OUTPUTS(context.launch._id, "echo_node"),
      LAUNCH_EXPIRED,
      JSON.stringify({ result: json })
    );
    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      NODE_INPUT(context.launch._id, "sink_node", "value"),
      LAUNCH_EXPIRED,
      json
    );
    expect(doubles.redis.sAdd).toHaveBeenCalledWith(
      NODE_FLOWS(context.launch._id, "sink_node"),
      "result_flow"
    );
    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      NODE_PROCESSED_LOCK(context.launch._id, "echo_node"),
      LAUNCH_EXPIRED,
      "x"
    );
    expect(doubles.plans.regular).toHaveBeenCalledExactlyOnceWith(
      { launch: context.launch._id, node: "sink_node" },
      { delay: 1000 }
    );
    for (const key of [
      NODE_STATUS,
      NODE_STATE,
      NODE_PROGRESS,
      NODE_PROCESSED_LOCK,
    ]) {
      expect(doubles.redis.del).toHaveBeenCalledWith(
        key(context.launch._id, "sink_node")
      );
    }
    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      PIPELINE_OUTPUT(context.launch._id, "result"),
      LAUNCH_EXPIRED,
      json
    );
    expect(doubles.plans.output).toHaveBeenCalledWith({
      launch: context.launch._id,
      output: "result",
    });
    expect(doubles.metrics.finished).toHaveBeenCalledWith({
      launch: context.launch._id,
      finishedAt: EXECUTION_TIME,
      fromStart: 5,
    });
    expect(doubles.redis.lRem).toHaveBeenCalledWith(
      "scope-test",
      0,
      context.launch._id
    );
    expect(doubles.notify).toHaveBeenCalledWith(
      "user-test",
      "pipeline_done",
      expect.objectContaining({ launch: context.launch._id })
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("saves repeat state/progress and delays the same job without completing it", async () => {
    doubles.execute.mockResolvedValue({
      result: {
        __type: "repeat",
        delay: 2500,
        state: { page: 2 },
        progress: { total: 10, processed: 2 },
      },
      logs: [],
    });

    await expect(context.run()).rejects.toBeInstanceOf(DelayedError);

    expect(context.job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(
      EXECUTION_TIME.getTime() + 2500
    );
    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      NODE_STATE(context.launch._id, "echo_node"),
      LAUNCH_EXPIRED,
      '{"page":2}'
    );
    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      NODE_PROGRESS(context.launch._id, "echo_node"),
      LAUNCH_EXPIRED,
      '{"total":10,"processed":2}'
    );
    expect(doubles.plans.regular).not.toHaveBeenCalled();
    expect(doubles.metrics.finished).not.toHaveBeenCalled();
    expect(
      doubles.redis.setEx.mock.calls.some(
        ([key]) => key === NODE_PROCESSED_LOCK(context.launch._id, "echo_node")
      )
    ).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the default repeat delay when it is omitted", async () => {
    doubles.execute.mockResolvedValue({
      result: { __type: "repeat" },
      logs: [],
    });

    await expect(context.run()).rejects.toBeInstanceOf(DelayedError);

    expect(context.job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(
      EXECUTION_TIME.getTime() + 1000
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("supports looping NextNode results, input resets, explicit kicks, and custom delay", async () => {
    doubles.execute.mockResolvedValue({
      result: {
        __type: "next",
        behavior: "loop",
        reset: { inputs: ["enabled"] },
        kicks: ["sink_node"],
        delay: 250,
      },
      logs: [],
    });

    const result = await context.run();

    expect(result).toBe(NodeJobResult.NODE_PROCESSED);
    expect(doubles.redis.del).toHaveBeenCalledWith(
      NODE_INPUT(context.launch._id, "echo_node", "enabled")
    );
    expect(
      doubles.redis.setEx.mock.calls.some(
        ([key]) => key === NODE_PROCESSED_LOCK(context.launch._id, "echo_node")
      )
    ).toBe(false);
    expect(doubles.plans.regular).toHaveBeenCalledExactlyOnceWith(
      { launch: context.launch._id, node: "sink_node" },
      { delay: 250 }
    );
    expect(doubles.metrics.finished).not.toHaveBeenCalled();
  });

  it("queues artefact saving only when a bucket is selected", async () => {
    context.launch.launchRequest.options = { bucket: "artefacts" };

    await context.run();

    expect(doubles.plans.artefacts).toHaveBeenCalledExactlyOnceWith({
      launch: context.launch._id,
      node: "echo_node",
    });
  });

  it("respects disabled notifications", async () => {
    context.launch.options.notify = false;

    await context.run();

    expect(doubles.notify).not.toHaveBeenCalled();
  });
});
