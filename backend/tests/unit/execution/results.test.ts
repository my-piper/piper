import {
  doubles,
  liveState,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME } from "../../fixtures/launch";
import { DelayedError } from "bullmq";
import { toInstance } from "core-kit/packages/transform";
import { Pipeline, PipelineOutput } from "models/pipeline";
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
  const json = JSON.stringify({ enabled: false, count: 0 }, null, "  ");

  it("marks the node done and persists its outputs", async () => {
    const result = await context.run();

    expect(result).toBe(NodeJobResult.NODE_PROCESSED);
    expect(await liveState.status(context.launch._id, "echo_node")).toEqual({
      state: "done",
    });
    expect(
      await liveState.nodeOutputs(context.launch._id, "echo_node")
    ).toEqual({ result: json });
    expect(await liveState.isProcessed(context.launch._id, "echo_node")).toBe(
      true
    );
    expect(await liveState.isProcessing(context.launch._id, "echo_node")).toBe(
      false
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fills the downstream input, resets its state, and plans it", async () => {
    const { _id } = context.launch;
    await context.store();
    await liveState.nodeRepeats(_id, "sink_node", "earlier", {
      dueAt: 1,
      state: { page: 2 },
      progress: { total: 2, processed: 1 },
    });
    await liveState.nodeCompleted(context.launch, "sink_node", {
      processed: true,
    });

    await context.run();

    expect(
      await liveState.inputs(
        _id,
        "sink_node",
        context.launch.pipeline.nodes.get("sink_node").inputs
      )
    ).toEqual({ value: json });
    expect(await liveState.isFlowDone(_id, "sink_node", "result_flow")).toBe(
      true
    );
    expect(await liveState.status(_id, "sink_node")).toBeNull();
    expect(await liveState.state(_id, "sink_node")).toBeNull();
    expect(await liveState.progress(_id, "sink_node")).toBeNull();
    expect(await liveState.isProcessed(_id, "sink_node")).toBe(false);
    expect(doubles.plans.regular).toHaveBeenCalledExactlyOnceWith(
      { launch: context.launch._id, node: "sink_node" },
      { delay: 1000 }
    );
  });

  it("publishes the pipeline output, finishes the launch, and notifies", async () => {
    await context.run();

    expect(await liveState.output(context.launch, "result")).toBe(json);
    expect(await liveState.isFinished(context.launch)).toBe(true);
    expect(doubles.plans.output).toHaveBeenCalledWith({
      launch: context.launch._id,
      output: "result",
    });
    expect(doubles.metrics.finished).toHaveBeenCalledWith({
      launch: context.launch._id,
      finishedAt: EXECUTION_TIME,
      fromStart: 5,
    });
    expect((await liveState.scopeQueue("scope-test", 10)).waiting).toBe(0);
    expect(doubles.notify).toHaveBeenCalledWith(
      "user:user-test",
      "pipeline_done",
      expect.objectContaining({ launch: context.launch._id })
    );
  });

  it("keeps the launch running while an output fed by two flows is the only one filled", async () => {
    context.launch.pipeline.outputs = toInstance(
      {
        outputs: {
          result: {
            type: "json",
            flows: {
              result_flow: { from: "echo_node", output: "result" },
              late_flow: { from: "sink_node", output: "result" },
            },
          },
          summary: {
            type: "json",
            flows: { summary_flow: { from: "sink_node", output: "summary" } },
          },
        },
      },
      Pipeline
    ).outputs;
    await context.store();
    await liveState.nodeCompleted(context.launch, "sink_node", {
      processed: true,
      pipelineOutputs: { result: json },
    });

    await context.run();

    expect(await liveState.output(context.launch, "result")).toBe(json);
    expect(await liveState.isFinished(context.launch)).toBe(false);
    expect(doubles.metrics.finished).not.toHaveBeenCalled();
    expect((await liveState.scopeQueue("scope-test", 10)).waiting).toBe(1);
  });

  it("finishes the launch when an output without flows stays empty", async () => {
    context.launch.pipeline.outputs.set(
      "unused",
      toInstance({ type: "string" }, PipelineOutput)
    );

    await context.run();

    expect(doubles.metrics.finished).toHaveBeenCalledWith({
      launch: context.launch._id,
      finishedAt: EXECUTION_TIME,
      fromStart: 5,
    });
    expect((await liveState.scopeQueue("scope-test", 10)).waiting).toBe(0);
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
    const { _id } = context.launch;
    expect(await liveState.state(_id, "echo_node")).toEqual({ page: 2 });
    expect(await liveState.progress(_id, "echo_node")).toEqual({
      total: 10,
      processed: 2,
    });
    expect(await liveState.dueAt(_id, "echo_node", "job-test")).toBe(
      EXECUTION_TIME.getTime() + 2500
    );
    expect(doubles.plans.regular).not.toHaveBeenCalled();
    expect(doubles.metrics.finished).not.toHaveBeenCalled();
    expect(await liveState.isProcessed(_id, "echo_node")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps repeat state/progress even when recording the run fails, and tells progress first", async () => {
    const failure = new Error("stream unavailable");
    doubles.metrics.nodeRuns.mockRejectedValue(failure);
    doubles.execute.mockResolvedValue({
      result: {
        __type: "repeat",
        state: { page: 3 },
        progress: { total: 10, processed: 3 },
      },
      logs: [],
    });

    await expect(context.run()).rejects.toBe(failure);

    const { _id } = context.launch;
    expect(await liveState.state(_id, "echo_node")).toEqual({ page: 3 });
    expect(await liveState.progress(_id, "echo_node")).toEqual({
      total: 10,
      processed: 3,
    });
    expect(context.job.moveToDelayed).not.toHaveBeenCalled();
    expect(
      doubles.notify.mock.calls
        .map(([, event]) => event)
        .filter(
          (event) => event.startsWith("node_") && event !== "node_running"
        )
    ).toEqual(["node_progress", "node_gonna_repeat"]);
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
    expect(
      await liveState.inputs(
        context.launch._id,
        "echo_node",
        context.launch.pipeline.nodes.get("echo_node").inputs
      )
    ).toEqual({ count: 0, text: "" });
    expect(await liveState.isProcessed(context.launch._id, "echo_node")).toBe(
      false
    );
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
