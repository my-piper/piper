import {
  doubles,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME } from "../../fixtures/launch";
import { LAUNCH_EXPIRED, NODE_INPUT, PIPELINE_OUTPUT } from "consts/redis";
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

      expect(doubles.redis.setEx).toHaveBeenCalledWith(
        NODE_INPUT(context.launch._id, "sink_node", "value"),
        LAUNCH_EXPIRED,
        encoded
      );
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

    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      NODE_INPUT(context.launch._id, "sink_node", "value"),
      LAUNCH_EXPIRED,
      "second.png"
    );
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

  it.each([null, "already filled"])(
    "checks remaining pipeline outputs before completion: %s",
    async (otherValue) => {
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
      if (otherValue !== null)
        context.responses.set(
          PIPELINE_OUTPUT(context.launch._id, "other"),
          otherValue
        );

      await context.run();

      expect(doubles.metrics.finished).toHaveBeenCalledTimes(
        otherValue === null ? 0 : 1
      );
      expect(doubles.redis.lRem).toHaveBeenCalledTimes(
        otherValue === null ? 0 : 1
      );
    }
  );
});
