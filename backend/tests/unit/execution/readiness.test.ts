import {
  doubles,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME } from "../../fixtures/launch";
import {
  LAUNCH_INTERRUPTED,
  NODE_INPUT,
  NODE_PROCESSED_LOCK,
  NODE_PROCESSING_LOCK,
} from "consts/redis";
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
      prepare: () =>
        doubles.redis.EXISTS.mockImplementation(async (key) =>
          Number(key === LAUNCH_INTERRUPTED(context.launch._id))
        ),
    },
    {
      name: "already processed node",
      result: NodeJobResult.NODE_HAS_BEEN_PROCESSED_ALREADY,
      prepare: () =>
        doubles.redis.GET.mockImplementation(async (key) =>
          key === NODE_PROCESSED_LOCK(context.launch._id, "echo_node")
            ? "x"
            : null
        ),
    },
    {
      name: "missing launch",
      result: NodeJobResult.LAUNCH_NOT_FOUND,
      prepare: () => doubles.redis.get.mockResolvedValue(null),
    },
    {
      name: "missing node",
      result: NodeJobResult.NODE_NOT_FOUND_IN_WORKFLOW,
      prepare: () => context.launch.pipeline.nodes.delete("echo_node"),
    },
    {
      name: "excluded node",
      result: NodeJobResult.NODE_IN_NOT_INCLUSIVE,
      prepare: () => {
        context.launch.launchRequest.inclusive = { nodes: ["sink_node"] };
      },
    },
    {
      name: "missing required input",
      result: NodeJobResult.NODE_INPUTS_NOT_READY_YET,
      prepare: () =>
        context.responses.delete(
          NODE_INPUT(context.launch._id, "echo_node", "enabled")
        ),
    },
    {
      name: "already running node",
      result: NodeJobResult.NODE_IS_PROCESSING_NOW_ALREADY,
      prepare: () =>
        doubles.redis.GET.mockImplementation(async (key) =>
          key === NODE_PROCESSING_LOCK(context.launch._id, "echo_node")
            ? "x"
            : null
        ),
    },
  ])(
    "skips a $name without starting execution",
    async ({ prepare, result }) => {
      prepare();

      const actual = await context.run();

      expect(actual).toBe(result);
      expect(doubles.execute).not.toHaveBeenCalled();
      expect(doubles.redis.setEx).not.toHaveBeenCalled();
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
      doubles.redis.sIsMember.mockResolvedValue(false);

      const result = await context.run();

      expect(result).toBe(NodeJobResult.NODE_FLOWS_NOT_READY_YET);
      expect(doubles.execute).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it.each(["move", "inclusive"])(
    "allows a %s node without waiting for its upstream flow",
    async (mode) => {
      context.launch.pipeline.flows.set(
        "upstream",
        toInstance(
          {
            from: "sink_node",
            output: "result",
            to: "echo_node",
            input: "enabled",
            mode: "move",
          },
          NodeFlow
        )
      );
      if (mode === "inclusive") {
        context.launch.pipeline.flows.get("upstream").mode = "wait";
        context.launch.launchRequest.inclusive = { nodes: ["echo_node"] };
      }
      doubles.redis.sIsMember.mockResolvedValue(false);

      const result = await context.run();

      expect(result).toBe(NodeJobResult.NODE_PROCESSED);
      expect(doubles.redis.sIsMember).not.toHaveBeenCalled();
      expect(doubles.execute).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    }
  );
});
