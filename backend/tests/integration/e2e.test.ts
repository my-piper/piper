import { mongo, redis } from "./runtime";
import { DEPLOY_PREFIX, pipelineLaunch, publishDeploy } from "./fixture";
import {
  NODE_LOGS,
  NODE_PROCESSED_LOCK,
  NODE_STATUS,
  PIPELINE_OUTPUT,
} from "consts/redis";
import { run } from "packages/launches/launching";
import { describe, expect, it, vi } from "vitest";

const echoScript = `export function run({ inputs }) {
  console.info("echo received", JSON.stringify(inputs));
  return { __type: "next", outputs: { result: inputs } };
}`;
const sinkScript = `export function run({ inputs }) {
  return { __type: "next", outputs: { result: inputs.value } };
}`;
const failingScript = `export function run() {
  throw new Error("sink rejected the value");
}`;
// asks for a Child Launch until it has finished, then passes its output on
const callingScript = (slug: string) => `export function run({ children }) {
  const child = children?.summary;
  if (child?.status === "finished") {
    return { __type: "next", outputs: { result: child.outputs.result } };
  }
  return {
    __type: "launch",
    launches: [{
      key: "summary",
      deploy: { prefix: "${DEPLOY_PREFIX}", slug: "${slug}" },
      inputs: { text: "from parent" },
    }],
    delay: 200,
  };
}`;

describe("pipeline executed by the real Deno service", () => {
  it("runs both nodes in Deno and publishes the falsy pipeline output", async () => {
    const source = pipelineLaunch();
    source.pipeline.nodes.get("echo_node").script = echoScript;
    source.pipeline.nodes.get("sink_node").script = sinkScript;

    const launch = await run(source);
    await vi.waitFor(
      async () =>
        expect(
          await redis.exists(NODE_PROCESSED_LOCK(launch._id, "sink_node"))
        ).toBe(1),
      { timeout: 20_000, interval: 50 }
    );

    expect(
      JSON.parse(await redis.get(PIPELINE_OUTPUT(launch._id, "result")))
    ).toEqual({ enabled: false, count: 0, text: "" });
    const logs = (
      await redis.lRange(NODE_LOGS(launch._id, "echo_node"), 0, -1)
    ).map((log) => JSON.parse(log));
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: "info",
        message: expect.stringContaining('"count":0'),
        ts: expect.any(Number),
      })
    );
  });

  it("records a Deno script exception on the failing node", async () => {
    const source = pipelineLaunch();
    source.pipeline.nodes.get("echo_node").script = echoScript;
    source.pipeline.nodes.get("sink_node").script = failingScript;

    const launch = await run(source);
    await vi.waitFor(
      async () =>
        expect(
          JSON.parse(await redis.get(NODE_STATUS(launch._id, "sink_node")))
        ).toMatchObject({
          state: "error",
          error: expect.stringContaining("sink rejected the value"),
        }),
      { timeout: 20_000, interval: 50 }
    );

    expect(await redis.exists(PIPELINE_OUTPUT(launch._id, "result"))).toBe(0);
    expect(
      await redis.exists(NODE_PROCESSED_LOCK(launch._id, "sink_node"))
    ).toBe(0);
  });

  it("runs a Child Launch in Deno and resumes the parent with its output", async () => {
    const child = pipelineLaunch();
    child.pipeline.nodes.get("echo_node").script = echoScript;
    child.pipeline.nodes.get("sink_node").script = sinkScript;
    const deploy = await publishDeploy(child);
    const source = pipelineLaunch();
    source.pipeline.nodes.get("echo_node").script = callingScript(deploy.slug);
    source.pipeline.nodes.get("sink_node").script = sinkScript;

    const launch = await run(source);
    await vi.waitFor(
      async () =>
        expect(
          await redis.exists(NODE_PROCESSED_LOCK(launch._id, "sink_node"))
        ).toBe(1),
      { timeout: 20_000, interval: 50 }
    );

    expect(
      JSON.parse(await redis.get(PIPELINE_OUTPUT(launch._id, "result")))
    ).toEqual({ enabled: false, count: 0, text: "from parent" });
    expect(
      await mongo.launches.countDocuments({ parent: launch._id, depth: 1 })
    ).toBe(1);
  });
});
