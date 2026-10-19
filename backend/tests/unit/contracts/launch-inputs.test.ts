import { LAUNCH_EXPIRED, NODE_INPUT } from "consts/redis";
import { toInstance } from "core-kit/packages/transform";
import { LaunchRequest } from "models/launch-request";
import { Pipeline } from "models/pipeline";
import { run } from "packages/launches/launching";
import { describe, expect, it, vi } from "vitest";
import { pipelineFixture } from "../../fixtures/pipeline";

const { redis, insertOne, planInputs } = vi.hoisted(() => ({
  redis: { setEx: vi.fn(), readInstance: vi.fn() },
  insertOne: vi.fn(),
  planInputs: vi.fn(),
}));

vi.mock("app/mongo", () => ({ default: { launches: { insertOne } } }));
vi.mock("app/queues", () => ({
  queues: { launches: { inputs: { set: { plan: planInputs } } } },
}));
vi.mock("app/storage", () => ({}));
vi.mock("core-kit/packages/redis", () => ({
  default: redis,
  readInstance: redis.readInstance,
}));

describe("launch input value preservation", () => {
  it.each([
    {
      name: "falsy values",
      inputs: { enabled: false, count: 0, text: "" },
      expected: ["", "0", ""],
    },
    { name: "absent values", inputs: {}, expected: ["1", "5", "default text"] },
    {
      name: "undefined values",
      inputs: { enabled: undefined, count: undefined, text: undefined },
      expected: ["1", "5", "default text"],
    },
    {
      name: "explicit null values",
      inputs: { enabled: null, count: null, text: null },
      expected: ["<!null!>", "<!null!>", "<!null!>"],
    },
  ])("propagates $name to node inputs", async ({ inputs, expected }) => {
    const pipeline = toInstance(pipelineFixture(), Pipeline);
    pipeline.start.nodes = [];
    const launchRequest = toInstance({ inputs, nodes: {} }, LaunchRequest);

    const launch = await run({ pipeline, launchRequest });

    for (const [index, key] of ["enabled", "count", "text"].entries()) {
      const inputKey = NODE_INPUT(launch._id, "echo_node", key);
      const writes = redis.setEx.mock.calls.filter(([key]) => key === inputKey);
      expect(writes.at(-1)).toEqual([
        inputKey,
        LAUNCH_EXPIRED,
        expected[index],
      ]);
    }
  });

  it("leaves an absent input unset when no default exists", async () => {
    const pipeline = toInstance(pipelineFixture(), Pipeline);
    pipeline.start.nodes = [];
    delete pipeline.inputs.get("text").default;
    const launchRequest = toInstance({ inputs: {}, nodes: {} }, LaunchRequest);

    const launch = await run({ pipeline, launchRequest });

    expect(
      redis.setEx.mock.calls.some(
        ([key]) => key === NODE_INPUT(launch._id, "echo_node", "text")
      )
    ).toBe(false);
  });

  it.each([
    {
      name: "falsy values",
      inputs: { enabled: false, count: 0, text: "" },
      expected: ["", "0", ""],
    },
    {
      name: "explicit null values",
      inputs: { enabled: null, count: null, text: null },
      expected: ["<!null!>", "<!null!>", "<!null!>"],
    },
  ])("preserves direct node $name", async ({ inputs, expected }) => {
    const pipeline = toInstance(pipelineFixture(), Pipeline);
    pipeline.start.nodes = [];
    pipeline.inputs.clear();
    const launchRequest = toInstance(
      { inputs: {}, nodes: { echo_node: { inputs } } },
      LaunchRequest
    );

    const launch = await run({ pipeline, launchRequest });

    for (const [index, key] of ["enabled", "count", "text"].entries()) {
      expect(redis.setEx).toHaveBeenCalledWith(
        NODE_INPUT(launch._id, "echo_node", key),
        LAUNCH_EXPIRED,
        expected[index]
      );
    }
  });

  it("applies defaults to missing required node inputs and leaves optional inputs unset", async () => {
    const pipeline = toInstance(pipelineFixture(), Pipeline);
    pipeline.start.nodes = [];
    pipeline.inputs.clear();
    const launchRequest = toInstance({ inputs: {}, nodes: {} }, LaunchRequest);

    const launch = await run({ pipeline, launchRequest });

    expect(redis.setEx).toHaveBeenCalledWith(
      NODE_INPUT(launch._id, "echo_node", "enabled"),
      LAUNCH_EXPIRED,
      "1"
    );
    for (const key of ["count", "text"]) {
      expect(
        redis.setEx.mock.calls.some(
          ([writtenKey]) =>
            writtenKey === NODE_INPUT(launch._id, "echo_node", key)
        )
      ).toBe(false);
    }
  });
});
