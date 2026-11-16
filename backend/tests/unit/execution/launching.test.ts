import {
  doubles,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { EXECUTION_TIME, launchFixture } from "../../fixtures/launch";
import { LAUNCH, LAUNCH_EXPIRED, NODE_INPUT } from "consts/redis";
import { toPlain } from "core-kit/packages/transform";
import { Launch } from "models/launch";
import { get, getPlain, kick, run } from "packages/launches/launching";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("utils/string", () => ({ sid: () => "fixed-launch" }));
vi.mock("ulid", () => ({ ulid: () => "fixed-cursor" }));

beforeEach(() => {
  resetExecutionDoubles();
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
});

describe("launch persistence and scheduling", () => {
  it("persists a launch, initializes output metadata, and starts configured nodes", async () => {
    const source = launchFixture();
    source.scope.activated = false;

    const launch = await run(source);

    expect(launch).toBeInstanceOf(Launch);
    expect(launch._id).toBe("fixed-launch");
    expect(launch.cursor).toBe("fixed-cursor");
    expect(launch.launchedAt).toEqual(EXECUTION_TIME);
    expect(launch.parent).toBeNull();
    expect(launch.costs).toBeNull();
    expect(toPlain(launch.outputs.get("result"))).toEqual({ type: "json" });
    expect(doubles.insertOne).toHaveBeenCalledOnce();
    expect(doubles.insertOne.mock.calls[0][0]).not.toHaveProperty("pipeline");
    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      LAUNCH(launch._id),
      LAUNCH_EXPIRED,
      JSON.stringify(toPlain(launch))
    );
    expect(doubles.plans.rapid).toHaveBeenCalledExactlyOnceWith(
      { launch: launch._id, node: "echo_node" },
      {}
    );
    expect(doubles.plans.run).not.toHaveBeenCalled();
    expect(doubles.plans.inputs).toHaveBeenCalledWith(
      { launch: launch._id },
      { delay: 2000 }
    );
  });

  it("queues scoped launches without starting their nodes immediately", async () => {
    const source = launchFixture();

    const launch = await run(source);

    expect(doubles.redis.rPush).toHaveBeenCalledExactlyOnceWith(
      "scope-test",
      launch._id
    );
    expect(doubles.plans.run).toHaveBeenCalledExactlyOnceWith({
      launch: launch._id,
      scope: source.scope,
    });
    expect(doubles.plans.rapid).not.toHaveBeenCalled();
  });

  it("starts an unscoped launch when it is created", async () => {
    const source = launchFixture();
    source.scope.activated = false;

    const launch = await run(source);

    expect(launch.startedAt).toEqual(EXECUTION_TIME);
    expect(doubles.redis.set).not.toHaveBeenCalled();
  });

  it("stores the start time of a scoped launch when it is kicked", async () => {
    const launch = launchFixture();

    await kick(launch);

    expect(launch.startedAt).toEqual(EXECUTION_TIME);
    expect(doubles.redis.set).toHaveBeenCalledExactlyOnceWith(
      LAUNCH(launch._id),
      JSON.stringify(toPlain(launch)),
      { KEEPTTL: true }
    );
  });

  it("uses an inclusive starting-node selection", async () => {
    const launch = launchFixture();
    launch.launchRequest.inclusive = { nodes: ["sink_node"] };

    await kick(launch);

    expect(doubles.plans.regular).toHaveBeenCalledExactlyOnceWith(
      { launch: launch._id, node: "sink_node" },
      {}
    );
    expect(doubles.plans.rapid).not.toHaveBeenCalled();
  });

  it("retains an explicitly empty inclusive selection", async () => {
    const launch = launchFixture();
    launch.launchRequest.inclusive = { nodes: [] };

    await kick(launch);

    expect(doubles.plans.rapid).not.toHaveBeenCalled();
    expect(doubles.plans.regular).not.toHaveBeenCalled();
  });

  it("stores image input data URIs before propagating their URL", async () => {
    const launch = launchFixture();
    launch.pipeline.inputs.get("text").type = "image";
    launch.pipeline.nodes.get("echo_node").inputs.get("text").type = "image";
    launch.launchRequest.inputs.set(
      "text",
      `data:image/png;base64,${Buffer.from("image bytes").toString("base64")}`
    );
    doubles.artefact.mockResolvedValue("https://example.com/image.png");

    const result = await run(launch);

    expect(doubles.artefact).toHaveBeenCalledExactlyOnceWith(
      Buffer.from("image bytes"),
      "fixed-launch.png"
    );
    expect(result.launchRequest.inputs.get("text")).toBe(
      "https://example.com/image.png"
    );
    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      NODE_INPUT(result._id, "echo_node", "text"),
      LAUNCH_EXPIRED,
      "https://example.com/image.png"
    );
  });

  it("propagates persistence failures without scheduling a launch", async () => {
    const failure = new Error("MongoDB unavailable");
    doubles.insertOne.mockRejectedValue(failure);

    await expect(run(launchFixture())).rejects.toBe(failure);

    expect(doubles.plans.run).not.toHaveBeenCalled();
    expect(doubles.plans.rapid).not.toHaveBeenCalled();
  });

  it("loads a stored launch as real nested models", async () => {
    const source = launchFixture();
    doubles.redis.get.mockResolvedValue(JSON.stringify(toPlain(source)));

    const launch = await get(source._id);

    expect(launch._id).toBe(source._id);
    expect(launch.pipeline.nodes).toBeInstanceOf(Map);
    expect(launch.launchedAt).toEqual(source.launchedAt);
    expect(doubles.redis.get).toHaveBeenCalledWith(LAUNCH(source._id));
  });

  it("rejects a missing launch", async () => {
    await expect(getPlain("missing-launch")).rejects.toThrow(
      "Launch missing-launch is not found"
    );
  });
});
