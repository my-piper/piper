import { toInstance } from "core-kit/packages/transform";
import { LaunchRequest } from "models/launch-request";
import { Pipeline } from "models/pipeline";
import { User } from "models/user";
import { getCosts } from "packages/pipelines/pipeline-costs";
import { describe, expect, it, vi } from "vitest";
import { pipelineFixture } from "../../fixtures/pipeline";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("packages/deno/execute", () => ({ execute }));
vi.mock("core-kit/packages/redis", () => ({
  default: {},
  readInstance: vi.fn(),
}));
vi.mock("app/storage", () => ({}));

describe.each([
  "pipeline script",
  "node script with flows",
  "node script with direct inputs",
])("cost input contracts: %s", (mode) => {
  it.each([
    {
      name: "falsy values",
      inputs: { enabled: false, count: 0, text: "" },
      expected: { enabled: false, count: 0, text: "" },
    },
    {
      name: "absent values",
      inputs: {},
      expected: { enabled: true, count: 5, text: "default text" },
    },
    {
      name: "undefined values",
      inputs: { enabled: undefined, count: undefined, text: undefined },
      expected: { enabled: true, count: 5, text: "default text" },
    },
    {
      name: "explicit null values",
      inputs: { enabled: null, count: null, text: null },
      expected: {},
    },
  ])("passes $name to the cost function", async ({ inputs, expected }) => {
    const pipeline = toInstance(pipelineFixture(), Pipeline);
    const directInputs = mode === "node script with direct inputs";
    if (mode === "pipeline script") {
      pipeline.script = "function costs({ inputs }) { return 1; }";
    }
    if (directInputs) {
      pipeline.inputs.clear();
    }
    const request = toInstance(
      {
        inputs: directInputs ? {} : inputs,
        nodes: { echo_node: { inputs: directInputs ? inputs : {} } },
      },
      LaunchRequest
    );
    execute.mockResolvedValue({ result: 1, logs: [] });

    await getCosts(pipeline, request, new User({ _id: "test-user" }));

    expect(execute).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      "costs",
      expect.objectContaining({ inputs: expected }),
      expect.any(Object)
    );
  });

  it("omits missing inputs when no defaults exist", async () => {
    const pipeline = toInstance(pipelineFixture(), Pipeline);
    for (const input of pipeline.inputs.values()) {
      delete input.default;
    }
    for (const input of pipeline.nodes.get("echo_node").inputs.values()) {
      delete input.default;
    }
    if (mode === "pipeline script") {
      pipeline.script = "function costs({ inputs }) { return 1; }";
    }
    if (mode === "node script with direct inputs") {
      pipeline.inputs.clear();
    }
    const request = toInstance({ inputs: {}, nodes: {} }, LaunchRequest);
    execute.mockResolvedValue({ result: 1, logs: [] });

    await getCosts(pipeline, request, new User({ _id: "test-user" }));

    expect(execute).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      "costs",
      expect.objectContaining({ inputs: {} }),
      expect.any(Object)
    );
  });
});
