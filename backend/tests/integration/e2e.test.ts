import { redis } from "./runtime";
import { pipelineLaunch } from "./fixture";
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
});
