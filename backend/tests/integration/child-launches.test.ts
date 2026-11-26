import { mongo, redis, nodeQueue } from "./runtime";
import { DEPLOY_PREFIX, pipelineLaunch, publishDeploy } from "./fixture";
import { Job } from "bullmq";
import {
  LAUNCH_INTERRUPTED,
  NODE_CHILDREN,
  NODE_PROCESSED_LOCK,
  NODE_STATUS,
  PIPELINE_ERRORS,
  PIPELINE_OUTPUT,
} from "consts/redis";
import { FatalError } from "core-kit/types/errors";
import { execute } from "packages/deno/execute";
import { ChildLaunchState } from "packages/launches/child-launches";
import { interrupt, run } from "packages/launches/launching";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("packages/deno/execute", () => ({ execute: vi.fn() }));

// long enough that a delayed parent node only resumes when a test promotes it
const PARENT_DELAY = 600_000;
const WAIT = { timeout: 10_000, interval: 20 };
const childOutput = { enabled: false, count: 0, text: "from parent" };
const executeMock = vi.mocked(execute);

type Payload = {
  inputs: Record<string, unknown>;
  children?: Record<string, ChildLaunchState>;
};

function nextResult(value: unknown) {
  return { result: { __type: "next", outputs: { result: value } }, logs: [] };
}

function launchResult(slug: string) {
  return {
    result: {
      __type: "launch",
      launches: [
        {
          key: "summary",
          deploy: { prefix: DEPLOY_PREFIX, slug },
          inputs: { text: "from parent" },
        },
      ],
      delay: PARENT_DELAY,
    },
    logs: [],
  };
}

const marker = (caller: string) => `/* ${caller} */`;

// a pipeline whose first node starts a Child Launch of a Deploy
function callingLaunch(caller: string) {
  const source = pipelineLaunch();
  source.pipeline.nodes.get("echo_node").script =
    `function run() { ${marker(caller)} }`;
  return source;
}

// A fake Deno: each caller (a key of deploysByCaller) asks for a child of its
// Deploy until that child has finished, then passes the child's output on, as
// a node script in piper-nodes does. Other echo nodes wait for echoGate.
function childAwareExecute(
  deploysByCaller: Record<string, string>,
  echoGate: Promise<void> = Promise.resolve()
) {
  return async (script: string, _fn: string, payload: unknown) => {
    const { inputs, children } = payload as Payload;
    const caller = Object.keys(deploysByCaller).find((name) =>
      script.includes(marker(name))
    );
    if (caller) {
      const child = children?.summary;
      return child?.status === "finished"
        ? nextResult(child.outputs["result"])
        : launchResult(deploysByCaller[caller]);
    }
    if (script.includes("echo")) {
      await echoGate;
      return nextResult(inputs);
    }
    return nextResult(inputs.value);
  };
}

// like childAwareExecute, but every echo node of a child fails fatally
function failingChildExecute(deploysByCaller: Record<string, string>) {
  const execute = childAwareExecute(deploysByCaller);
  return async (script: string, fn: string, payload: unknown) => {
    if (script.includes("echo")) {
      throw new FatalError("child rejected the value");
    }
    return execute(script, fn, payload);
  };
}

function gate() {
  let open: () => void;
  const closed = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { closed, open: () => open() };
}

function payloadsOf(caller: string) {
  return executeMock.mock.calls
    .filter(([script]) => script.includes(marker(caller)))
    .map(([, , payload]) => payload as Payload);
}

async function delayedNode(launch: string) {
  let job: Job;
  await vi.waitFor(async () => {
    job = (await nodeQueue.getDelayed()).find(
      ({ data }) => data.launch === launch
    );
    expect(job).toBeDefined();
  }, WAIT);
  return job;
}

async function childOf(parent: string) {
  const children = await mongo.launches.find({ parent }).toArray();
  expect(children).toHaveLength(1);
  return children[0];
}

// waits for the sink node, then returns the launch's pipeline output
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

async function idleNodes() {
  await vi.waitFor(async () => {
    const counts = await nodeQueue.getJobCounts("active", "waiting");
    expect(counts).toMatchObject({ active: 0, waiting: 0 });
  }, WAIT);
}

beforeEach(() => {
  executeMock.mockReset();
});

describe("child launches through real workers", () => {
  it("resumes the parent node with the outputs of its finished child", async () => {
    const deploy = await publishDeploy();
    executeMock.mockImplementation(childAwareExecute({ parent: deploy.slug }));

    const parent = await run(callingLaunch("parent"));
    const parentNode = await delayedNode(parent._id);
    const child = await childOf(parent._id);
    const childResult = await launchOutput(child._id);
    await parentNode.promote();
    const parentResult = await launchOutput(parent._id);

    expect(child).toMatchObject({
      depth: 1,
      launchedBy: { _id: parent.launchedBy._id },
      project: { _id: deploy.project._id },
    });
    expect(childResult).toEqual(childOutput);
    expect(parentResult).toEqual(childOutput);
    expect(payloadsOf("parent").map(({ children }) => children)).toEqual([
      undefined,
      {
        summary: {
          launch: child._id,
          status: "finished",
          outputs: { result: childOutput },
        },
      },
    ]);
  });

  it("re-runs the parent node while its child runs without starting a second child", async () => {
    const deploy = await publishDeploy();
    const childEcho = gate();
    executeMock.mockImplementation(
      childAwareExecute({ parent: deploy.slug }, childEcho.closed)
    );
    try {
      const parent = await run(callingLaunch("parent"));
      const parentNode = await delayedNode(parent._id);
      await parentNode.promote();
      await vi.waitFor(
        () => expect(payloadsOf("parent")).toHaveLength(2),
        WAIT
      );
      await vi.waitFor(
        async () => expect(await parentNode.getState()).toBe("delayed"),
        WAIT
      );
      const reserved = await redis.get(NODE_CHILDREN(parent._id, "echo_node"));
      childEcho.open();
      const child = await childOf(parent._id);
      await launchOutput(child._id);
      await parentNode.promote();
      const parentResult = await launchOutput(parent._id);

      expect(payloadsOf("parent")[1].children).toEqual({
        summary: { launch: child._id, status: "running", outputs: {} },
      });
      expect(JSON.parse(reserved)).toEqual({ summary: child._id });
      expect(parentResult).toEqual(childOutput);
      expect(await mongo.launches.countDocuments({ parent: parent._id })).toBe(
        1
      );
    } finally {
      childEcho.open();
    }
  });

  it("fails the parent node without retrying when its child failed", async () => {
    const deploy = await publishDeploy();
    executeMock.mockImplementation(
      failingChildExecute({ parent: deploy.slug })
    );

    const parent = await run(callingLaunch("parent"));
    const parentNode = await delayedNode(parent._id);
    const child = await childOf(parent._id);
    await vi.waitFor(
      async () =>
        expect(await redis.lRange(PIPELINE_ERRORS(child._id), 0, -1)).toContain(
          "child rejected the value"
        ),
      WAIT
    );
    await parentNode.promote();
    await vi.waitFor(
      async () =>
        expect(
          JSON.parse(await redis.get(NODE_STATUS(parent._id, "echo_node")))
        ).toMatchObject({ state: "error" }),
      WAIT
    );

    const message = `Child launch summary (${child._id}) failed: child rejected the value`;
    expect(
      JSON.parse(await redis.get(NODE_STATUS(parent._id, "echo_node")))
    ).toMatchObject({ error: message });
    // the error list is written after the node status (process-node-error)
    await vi.waitFor(
      async () =>
        expect(
          await redis.lRange(PIPELINE_ERRORS(parent._id), 0, -1)
        ).toContain(message),
      WAIT
    );
    // a retryable error would leave the job waiting for its next attempt; a
    // fatal one removes it
    await vi.waitFor(
      async () => expect(await nodeQueue.getJob(parentNode.id)).toBeUndefined(),
      WAIT
    );
    expect(await redis.exists(PIPELINE_OUTPUT(parent._id, "result"))).toBe(0);
  });

  it("stops the whole chain of children when the parent is interrupted", async () => {
    const leaf = await publishDeploy();
    const middle = await publishDeploy(callingLaunch("middle"));
    const leafEcho = gate();
    executeMock.mockImplementation(
      childAwareExecute(
        { parent: middle.slug, middle: leaf.slug },
        leafEcho.closed
      )
    );
    try {
      const parent = await run(callingLaunch("parent"));
      const parentNode = await delayedNode(parent._id);
      const child = await childOf(parent._id);
      const middleNode = await delayedNode(child._id);
      const grandchild = await childOf(child._id);
      await vi.waitFor(() => expect(payloadsOf("echo")).toHaveLength(1), WAIT);

      await interrupt(parent._id);
      leafEcho.open();
      await idleNodes();
      expect(await parentNode.getState()).toBe("delayed");
      expect(await middleNode.getState()).toBe("delayed");
      await parentNode.promote();
      await middleNode.promote();
      await idleNodes();

      expect(grandchild).toMatchObject({ parent: child._id, depth: 2 });
      for (const launch of [parent, child, grandchild]) {
        expect(await redis.exists(LAUNCH_INTERRUPTED(launch._id))).toBe(1);
        expect(await redis.exists(PIPELINE_OUTPUT(launch._id, "result"))).toBe(
          0
        );
      }
      expect(payloadsOf("parent")).toHaveLength(1);
      expect(payloadsOf("middle")).toHaveLength(1);
      expect(payloadsOf("sink")).toEqual([]);
    } finally {
      leafEcho.open();
    }
  });
});
