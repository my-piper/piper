import { mongo, redis } from "./runtime";
import { DEPLOY_PREFIX, pipelineLaunch, publishDeploy } from "./fixture";
import { NODE_PROCESSED_LOCK, PIPELINE_OUTPUT } from "consts/redis";
import { execute } from "packages/deno/execute";
import { run } from "packages/launches/launching";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("packages/deno/execute", () => ({ execute: vi.fn() }));

// a deploy node re-checks its child after 3 s
const WAIT = { timeout: 15_000, interval: 50 };
const executeMock = vi.mocked(execute);

// the echo node returns its inputs, the sink node passes on its value
async function echoAndSink(script: string, _fn: string, payload: unknown) {
  const { inputs } = payload as { inputs: Record<string, unknown> };
  const value = script.includes("echo") ? inputs : inputs.value;
  return { result: { __type: "next", outputs: { result: value } }, logs: [] };
}

async function launchOutput(launch: string) {
  await vi.waitFor(
    async () =>
      expect(await redis.exists(NODE_PROCESSED_LOCK(launch, "sink_node"))).toBe(
        1
      ),
    WAIT
  );
  return JSON.parse(await redis.get(PIPELINE_OUTPUT(launch, "result")));
}

beforeEach(() => {
  executeMock.mockReset();
  executeMock.mockImplementation(echoAndSink);
});

describe("deploy nodes through real workers", () => {
  it("run their Deploy as a child and pass on its outputs", async () => {
    const deploy = await publishDeploy();
    const source = pipelineLaunch();
    const node = source.pipeline.nodes.get("echo_node");
    node.source = "deploy";
    node.deploy = { prefix: DEPLOY_PREFIX, slug: deploy.slug };
    node.script = undefined;

    const parent = await run(source);
    const parentResult = await launchOutput(parent._id);
    const [child] = await mongo.launches.find({ parent: parent._id }).toArray();
    const childResult = await launchOutput(child._id);

    expect(child).toMatchObject({ depth: 1, project: deploy.project });
    expect(parentResult).toEqual(childResult);
    expect(parentResult).toMatchObject({ text: expect.any(String) });
    // only the child's echo and sink and the parent's sink ran in Deno
    expect(executeMock).toHaveBeenCalledTimes(3);
  });
});
