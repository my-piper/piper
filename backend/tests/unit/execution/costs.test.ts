import {
  doubles,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { launchFixture } from "../../fixtures/launch";
import { toInstance } from "core-kit/packages/transform";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  resetExecutionDoubles();
  vi.stubEnv("UNIT_COST", "2");
  vi.resetModules();
});

describe("pipeline cost totals and errors", () => {
  it("converts pipeline cost units and skips per-node estimates when a pipeline script exists", async () => {
    const { getCosts } = await import("packages/pipelines/pipeline-costs");
    const launch = launchFixture();
    launch.pipeline.script = "function costs() { return 3.5; }";
    doubles.execute.mockResolvedValue({ result: 3.5, logs: [] });

    const costs = await getCosts(
      launch.pipeline,
      launch.launchRequest,
      launch.launchedBy
    );

    expect(costs.pipeline).toBe(7);
    expect(costs.total).toBe(7);
    expect(costs.nodes).toBeUndefined();
    expect(doubles.execute).toHaveBeenCalledOnce();
  });

  it("totals numeric and structured node costs and skips scriptless nodes", async () => {
    const { getCosts } = await import("packages/pipelines/pipeline-costs");
    const launch = launchFixture();
    launch.pipeline.nodes.set(
      "without_script",
      toInstance(
        { title: "No script", inputs: {}, outputs: {} },
        (await import("models/node")).Node
      )
    );
    doubles.execute
      .mockResolvedValueOnce({ result: 1.5, logs: [] })
      .mockResolvedValueOnce({
        result: { costs: 2, details: "two items" },
        logs: [],
      });

    const costs = await getCosts(
      launch.pipeline,
      launch.launchRequest,
      launch.launchedBy
    );

    expect(costs.pipeline).toBe(0);
    expect(costs.total).toBe(7);
    expect(costs.nodes.get("echo_node").costs).toBe(3);
    expect(costs.nodes.get("sink_node")).toMatchObject({
      node: "Sink",
      costs: 4,
      details: "two items",
    });
    expect(costs.nodes.has("without_script")).toBe(false);
    expect(doubles.execute).toHaveBeenCalledTimes(2);
  });

  it.each(["service", "Deno"])(
    "retains the zero-cost fallback for %s errors",
    async (kind) => {
      const { getCosts } = await import("packages/pipelines/pipeline-costs");
      const { ExecutionError } = await import("packages/deno/classes");
      const error =
        kind === "Deno"
          ? toInstance(
              { message: "bad script", code: "DATA_ERROR" },
              ExecutionError
            )
          : new Error("service unavailable");
      const launch = launchFixture();
      doubles.execute.mockRejectedValue(error);

      const costs = await getCosts(
        launch.pipeline,
        launch.launchRequest,
        launch.launchedBy
      );

      expect(costs.total).toBe(0);
      expect([...costs.nodes.values()].map(({ costs }) => costs)).toEqual([
        0, 0,
      ]);
    }
  );

  it("rejects invalid structured costs rather than silently returning zero", async () => {
    const { getCosts } = await import("packages/pipelines/pipeline-costs");
    const { DataError } = await import("core-kit/types/errors");
    const launch = launchFixture();
    doubles.execute.mockResolvedValue({ result: { costs: 1 }, logs: [] });

    await expect(
      getCosts(launch.pipeline, launch.launchRequest, launch.launchedBy)
    ).rejects.toThrow(DataError);
  });

  it("propagates input conversion errors before contacting Deno", async () => {
    const { getCosts } = await import("packages/pipelines/pipeline-costs");
    const { DataError } = await import("core-kit/types/errors");
    const launch = launchFixture();
    launch.pipeline.script = "function costs() { return 1; }";
    launch.pipeline.inputs.get("text").type = "json";

    await expect(
      getCosts(launch.pipeline, launch.launchRequest, launch.launchedBy)
    ).rejects.toThrow(DataError);

    expect(doubles.execute).not.toHaveBeenCalled();
  });

  it("propagates environment decryption failures before contacting Deno", async () => {
    const { getCosts } = await import("packages/pipelines/pipeline-costs");
    const { FatalError } = await import("core-kit/types/errors");
    const { NodeEnvironment } = await import("models/node");
    const { Environment } = await import("models/environment");
    const { GLOBAL_ENVIRONMENT_KEY } = await import("consts/redis");
    const { toPlain } = await import("core-kit/packages/transform");
    const launch = launchFixture();
    launch.pipeline.nodes.get("echo_node").environment = new Map([
      ["key", toInstance({ scope: "global" }, NodeEnvironment)],
    ]);
    const environment = toInstance(
      { variables: { key: "corrupted ciphertext" } },
      Environment
    );
    doubles.redis.get.mockImplementation(async (key) =>
      key === GLOBAL_ENVIRONMENT_KEY
        ? JSON.stringify(toPlain(environment))
        : null
    );
    vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      getCosts(launch.pipeline, launch.launchRequest, launch.launchedBy)
    ).rejects.toThrow(FatalError);

    expect(doubles.execute).not.toHaveBeenCalled();
  });
});
