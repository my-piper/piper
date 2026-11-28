import { liveStore } from "../../helpers/live-state";
import { LAUNCH_EXPIRED, NODE_INPUT } from "packages/launches/live-state/keys";
import { toInstance } from "core-kit/packages/transform";
import { LaunchRequest } from "models/launch-request";
import { Pipeline } from "models/pipeline";
import { run } from "packages/launches/launching";
import { describe, expect, it, vi } from "vitest";
import { pipelineFixture } from "../../fixtures/pipeline";

const { insertOne, planInputs } = vi.hoisted(() => ({
  insertOne: vi.fn(),
  planInputs: vi.fn(),
}));

vi.mock("app/mongo", () => ({ default: { launches: { insertOne } } }));
vi.mock("app/queues", () => ({
  queues: { launches: { inputs: { set: { plan: planInputs } } } },
}));
vi.mock("app/storage", () => ({}));
// reached through imports only; launch inputs live in the live state
vi.mock("core-kit/packages/redis", () => ({ default: {} }));

// a node input as stored: the wire value the worker decodes
async function stored(launch: string, input: string) {
  const key = NODE_INPUT(launch, "echo_node", input);
  const [value] = await liveStore.exec([{ op: "get", key }]);
  return { value, ttl: liveStore.ttl(key) };
}

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
      expect(await stored(launch._id, key)).toEqual({
        value: expected[index],
        ttl: LAUNCH_EXPIRED,
      });
    }
  });

  it("leaves an absent input unset when no default exists", async () => {
    const pipeline = toInstance(pipelineFixture(), Pipeline);
    pipeline.start.nodes = [];
    delete pipeline.inputs.get("text").default;
    const launchRequest = toInstance({ inputs: {}, nodes: {} }, LaunchRequest);

    const launch = await run({ pipeline, launchRequest });

    expect((await stored(launch._id, "text")).value).toBeNull();
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
      expect((await stored(launch._id, key)).value).toBe(expected[index]);
    }
  });

  it("applies defaults to missing required node inputs and leaves optional inputs unset", async () => {
    const pipeline = toInstance(pipelineFixture(), Pipeline);
    pipeline.start.nodes = [];
    pipeline.inputs.clear();
    const launchRequest = toInstance({ inputs: {}, nodes: {} }, LaunchRequest);

    const launch = await run({ pipeline, launchRequest });

    expect((await stored(launch._id, "enabled")).value).toBe("1");
    for (const key of ["count", "text"]) {
      expect((await stored(launch._id, key)).value).toBeNull();
    }
  });
});
