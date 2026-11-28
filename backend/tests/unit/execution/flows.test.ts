import {
  doubles,
  liveState,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { liveStore } from "../../helpers/live-state";
import { NODE_INPUT } from "packages/launches/live-state/keys";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME } from "../../fixtures/launch";
import { toInstance } from "core-kit/packages/transform";
import { PipelineOutput } from "models/pipeline";
import { beforeEach, describe, expect, it, vi } from "vitest";

let context: ReturnType<typeof nodeExecutionFixture>;

beforeEach(() => {
  resetExecutionDoubles();
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
  context = nodeExecutionFixture();
});

// the sink input as stored: the encoded text the next node reads (the wire
// format is the contract here)
async function sinkInput() {
  const [value] = await liveStore.exec([
    { op: "get", key: NODE_INPUT(context.launch._id, "sink_node", "value") },
  ]);
  return value;
}

describe("downstream flow conversion and completion", () => {
  it.each([
    { type: "boolean", value: false, encoded: "" },
    { type: "integer", value: "12", encoded: "12" },
    { type: "float", value: "1.25", encoded: "1.25" },
    { type: "string", value: 0, encoded: "0" },
    { type: "json", value: { nested: false }, encoded: '{"nested":false}' },
  ])(
    "maps a JSON path into a $type input",
    async ({ type, value, encoded }) => {
      context.launch.pipeline.nodes.get("sink_node").inputs.get("value").type =
        type as "boolean" | "integer" | "float" | "string" | "json";
      context.launch.pipeline.flows.get("result_flow").transformer = {
        type: "json",
        path: "payload.value",
        index: 0,
      };
      doubles.execute.mockResolvedValue({
        result: { __type: "next", outputs: { result: { payload: { value } } } },
        logs: [],
      });

      await context.run();

      expect(await sinkInput()).toBe(encoded);
      expect(doubles.plans.regular).toHaveBeenCalledOnce();
    }
  );

  it("selects an image-array element for a downstream image input", async () => {
    context.launch.pipeline.nodes.get("echo_node").outputs.get("result").type =
      "image[]";
    context.launch.pipeline.nodes.get("sink_node").inputs.get("value").type =
      "image";
    context.launch.pipeline.flows.get("result_flow").transformer = {
      type: "array",
      index: 1,
      path: undefined,
    };
    // A null bucket keeps these existing URLs without downloading media.
    context.launch.launchRequest.options = { bucket: null };
    doubles.execute.mockResolvedValue({
      result: {
        __type: "next",
        outputs: { result: ["first.png", "second.png"] },
      },
      logs: [],
    });

    await context.run();

    expect(await sinkInput()).toBe("second.png");
  });

  it("does not schedule downstream nodes for absent outputs", async () => {
    doubles.execute.mockResolvedValue({
      result: { __type: "next", outputs: {} },
      logs: [],
    });

    await context.run();

    expect(doubles.plans.regular).not.toHaveBeenCalled();
    expect(doubles.metrics.finished).not.toHaveBeenCalled();
  });

  it.each([
    { other: "missing", stored: {}, completions: 0 },
    {
      other: "already filled",
      stored: { other: "already filled" },
      completions: 1,
    },
  ])(
    "checks remaining pipeline outputs before completion: $other",
    async ({ stored, completions }) => {
      context.launch.pipeline.outputs.set(
        "other",
        toInstance(
          {
            type: "string",
            flows: { other_flow: { from: "sink_node", output: "result" } },
          },
          PipelineOutput
        )
      );
      await context.store();
      await liveState.nodeCompleted(context.launch, "sink_node", {
        processed: true,
        pipelineOutputs: stored,
      });

      await context.run();

      expect(doubles.metrics.finished).toHaveBeenCalledTimes(completions);
      expect((await liveState.scopeQueue("scope-test", 10)).waiting).toBe(
        1 - completions
      );
    }
  );
});
