import {
  doubles,
  liveState,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { liveStore, spyOnLiveState } from "../../helpers/live-state";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME } from "../../fixtures/launch";
import { toInstance } from "core-kit/packages/transform";
import { NodeFlow } from "models/node-flow";
import { NodeJobResult } from "types/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

let context: ReturnType<typeof nodeExecutionFixture>;

beforeEach(() => {
  resetExecutionDoubles();
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
  context = nodeExecutionFixture();
});

describe("node readiness and duplicate execution", () => {
  it.each([
    {
      name: "interrupted launch",
      result: NodeJobResult.LAUNCH_INTERRUPTED,
      prepare: () => liveState.interrupt(context.launch._id),
    },
    {
      name: "already processed node",
      result: NodeJobResult.NODE_HAS_BEEN_PROCESSED_ALREADY,
      prepare: () =>
        liveState.nodeCompleted(context.launch, "echo_node", {
          processed: true,
        }),
    },
    {
      name: "missing launch",
      result: NodeJobResult.LAUNCH_NOT_FOUND,
      prepare: () => liveStore.clear(),
    },
    {
      name: "missing node",
      result: NodeJobResult.NODE_NOT_FOUND_IN_WORKFLOW,
      prepare: async () => {
        context.launch.pipeline.nodes.delete("echo_node");
        await context.store();
      },
    },
    {
      name: "excluded node",
      result: NodeJobResult.NODE_IN_NOT_INCLUSIVE,
      prepare: async () => {
        context.launch.launchRequest.inclusive = { nodes: ["sink_node"] };
        await context.store();
      },
    },
    {
      name: "missing required input",
      result: NodeJobResult.NODE_INPUTS_NOT_READY_YET,
      prepare: async () => {
        liveStore.clear();
        context.inputs.splice(0, 1);
        await context.store();
      },
    },
    {
      name: "already running node",
      result: NodeJobResult.NODE_IS_PROCESSING_NOW_ALREADY,
      prepare: () => liveState.nodeStarted(context.launch._id, "echo_node"),
    },
  ])(
    "skips a $name without starting execution",
    async ({ prepare, result }) => {
      await context.store();
      await prepare();
      const status = await liveState.status(context.launch._id, "echo_node");

      const actual = await context.handle();

      expect(actual).toBe(result);
      expect(doubles.execute).not.toHaveBeenCalled();
      expect(await liveState.status(context.launch._id, "echo_node")).toEqual(
        status
      );
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each([undefined, "wait"])(
    "waits for an unfinished %s upstream flow",
    async (mode) => {
      context.launch.pipeline.flows.set(
        "upstream",
        toInstance(
          {
            from: "sink_node",
            output: "result",
            to: "echo_node",
            input: "enabled",
            mode,
          },
          NodeFlow
        )
      );

      const result = await context.run();

      expect(result).toBe(NodeJobResult.NODE_FLOWS_NOT_READY_YET);
      expect(doubles.execute).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(doubles.notify).toHaveBeenCalledWith(
        `launch:${context.launch._id}`,
        "node_not_ready",
        expect.objectContaining({ node: "echo_node" })
      );
    }
  );

  it("tells clients a node lacks a required input", async () => {
    context.inputs.splice(0, 1);

    const result = await context.run();

    expect(result).toBe(NodeJobResult.NODE_INPUTS_NOT_READY_YET);
    expect(doubles.notify).toHaveBeenCalledWith(
      `launch:${context.launch._id}`,
      "node_not_ready",
      expect.objectContaining({ node: "echo_node" })
    );
  });

  it.each([
    { mode: "move", flowMode: "move", inclusive: [] },
    { mode: "inclusive", flowMode: "wait", inclusive: ["echo_node"] },
  ])(
    "allows a $mode node without waiting for its upstream flow",
    async ({ flowMode, inclusive }) => {
      context.launch.pipeline.flows.set(
        "upstream",
        toInstance(
          {
            from: "sink_node",
            output: "result",
            to: "echo_node",
            input: "enabled",
            mode: flowMode,
          },
          NodeFlow
        )
      );
      context.launch.launchRequest.inclusive = { nodes: inclusive };
      const flowDone = spyOnLiveState("isFlowDone");

      const result = await context.run();

      expect(result).toBe(NodeJobResult.NODE_PROCESSED);
      expect(flowDone).not.toHaveBeenCalled();
      expect(doubles.execute).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    }
  );
});
