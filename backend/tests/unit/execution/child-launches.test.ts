import {
  doubles,
  liveState,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME, launchFixture } from "../../fixtures/launch";
import { pipelineFixture } from "../../fixtures/pipeline";
import { DEPLOY } from "consts/redis";
import { toInstance } from "core-kit/packages/transform";
import { PipelineOutput } from "models/pipeline";
import { DataError, FatalError } from "core-kit/types/errors";
import { DelayedError } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

let context: ReturnType<typeof nodeExecutionFixture>;
// deploys in Redis by key, read by packages/deploy
let deploys: Map<string, string>;

function deployFixture() {
  return {
    _id: "deploy-child",
    prefix: "user-test",
    slug: "child",
    project: { _id: "project-child", title: "Child project" },
    pipeline: pipelineFixture(),
    launchRequest: { inputs: { enabled: true, count: 1, text: "deployed" } },
  };
}

function launchResult(overrides: object = {}) {
  return {
    result: {
      __type: "launch",
      launches: [
        {
          key: "summary",
          deploy: { prefix: "user-test", slug: "child" },
          inputs: { text: "from parent" },
        },
      ],
      delay: 3000,
      ...overrides,
    },
    logs: [],
  };
}

async function startedChild(
  output: string | null,
  change: (child: ReturnType<typeof launchFixture>) => void = () => {}
) {
  const child = launchFixture();
  child._id = "child-1";
  change(child);
  await liveState.create(child, []);
  await liveState.setChildren(context.launch._id, "echo_node", {
    summary: "child-1",
  });
  if (output !== null) {
    await liveState.nodeCompleted(child, "echo_node", {
      processed: true,
      pipelineOutputs: { result: output },
    });
  }
}

async function failedChild() {
  await startedChild(null);
  await liveState.nodeFailed("child-1", "echo_node", "Upstream API is down", {
    outcome: "exhausted",
  });
}

function payload() {
  return doubles.execute.mock.calls[0][2] as Record<string, unknown>;
}

function childRequest(key: string, slug = "child") {
  return { key, deploy: { prefix: "user-test", slug } };
}

async function interrupted(launch: string) {
  expect(await liveState.interruptedAt(launch)).toEqual(EXECUTION_TIME);
}

function insertedLaunch() {
  return doubles.insertOne.mock.calls[0][0] as Record<string, unknown>;
}

beforeEach(() => {
  resetExecutionDoubles();
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
  context = nodeExecutionFixture();
  deploys = new Map([
    [DEPLOY("child", "user-test"), JSON.stringify(deployFixture())],
  ]);
  doubles.redis.get.mockImplementation(
    async (key: string) => deploys.get(key) ?? null
  );
});

describe("child launches", () => {
  it("starts a child launch from a deploy as the parent's user and delays the node", async () => {
    doubles.execute.mockResolvedValue(launchResult());

    await expect(context.run()).rejects.toBeInstanceOf(DelayedError);

    const child = insertedLaunch();
    expect(child).toMatchObject({
      parent: context.launch._id,
      depth: 1,
      launchedBy: { _id: "user-test" },
      project: { _id: "project-child" },
      launchRequest: {
        inputs: { enabled: true, count: 1, text: "from parent" },
      },
    });
    expect(await liveState.children(context.launch._id, "echo_node")).toEqual({
      summary: child["_id"],
    });
    expect(await liveState.exists(child["_id"] as string)).toBe(true);
    expect(context.job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(
      EXECUTION_TIME.getTime() + 3000
    );
  });

  it.each([
    { output: null, expected: { status: "running", outputs: {} } },
    {
      output: '{"answer":42}',
      expected: { status: "finished", outputs: { result: { answer: 42 } } },
    },
  ])(
    "gives the script the child's state ($expected.status)",
    async ({ output, expected }) => {
      await startedChild(output);

      await context.run();

      expect(payload().children).toEqual({
        summary: { launch: "child-1", ...expected },
      });
    }
  );

  it("finishes a child whose pipeline has an output without flows", async () => {
    await startedChild('{"answer":42}', (child) =>
      child.pipeline.outputs.set(
        "unused",
        toInstance({ type: "string" }, PipelineOutput)
      )
    );

    await context.run();

    expect(payload().children).toEqual({
      summary: {
        launch: "child-1",
        status: "finished",
        outputs: { result: { answer: 42 } },
      },
    });
  });

  it("leaves children out of the payload when the node started none", async () => {
    await context.run();

    expect(payload()).not.toHaveProperty("children");
  });

  it("fails the parent node without running its script when a child failed", async () => {
    await failedChild();

    const run = context.run();

    await expect(run).rejects.toBeInstanceOf(FatalError);
    await expect(run).rejects.toThrow(
      "Child launch summary (child-1) failed: Upstream API is down"
    );
    expect(doubles.execute).not.toHaveBeenCalled();
  });

  it("does not start a second child for a key the node already used", async () => {
    await startedChild(null);
    doubles.execute.mockResolvedValue(launchResult());

    await expect(context.run()).rejects.toBeInstanceOf(DelayedError);

    expect(doubles.insertOne).not.toHaveBeenCalled();
  });

  it("refuses to start a child deeper than three levels", async () => {
    context.launch.depth = 3;
    doubles.execute.mockResolvedValue(launchResult());

    const run = context.run();

    await expect(run).rejects.toBeInstanceOf(FatalError);
    await expect(run).rejects.toThrow("limited to 3 levels");
    expect(doubles.insertOne).not.toHaveBeenCalled();
  });

  it("refuses a deploy without pipeline outputs, which could never finish", async () => {
    deploys.set(
      DEPLOY("child", "user-test"),
      JSON.stringify({
        ...deployFixture(),
        pipeline: { ...pipelineFixture(), outputs: undefined },
      })
    );
    doubles.execute.mockResolvedValue(launchResult());

    await expect(context.run()).rejects.toBeInstanceOf(FatalError);

    expect(doubles.insertOne).not.toHaveBeenCalled();
  });

  it("refuses a deploy whose pipeline outputs have no flows", async () => {
    deploys.set(
      DEPLOY("child", "user-test"),
      JSON.stringify({
        ...deployFixture(),
        pipeline: {
          ...pipelineFixture(),
          outputs: { unused: { type: "string" } },
        },
      })
    );
    doubles.execute.mockResolvedValue(launchResult());

    await expect(context.run()).rejects.toThrow(
      "no pipeline outputs fed by a flow"
    );

    expect(doubles.insertOne).not.toHaveBeenCalled();
  });

  it("makes a re-planned downstream node forget its children, like its state", async () => {
    await liveState.setChildren(context.launch._id, "sink_node", {
      summary: "child-1",
    });

    await context.run();

    expect(await liveState.children(context.launch._id, "sink_node")).toBe(
      null
    );
  });

  it("interrupts the node's other children when one of them failed", async () => {
    await failedChild();

    await expect(context.run()).rejects.toBeInstanceOf(FatalError);

    await interrupted("child-1");
  });

  it("checks every requested child before starting any of them", async () => {
    doubles.execute.mockResolvedValue(
      launchResult({
        launches: [childRequest("first"), childRequest("second", "missing")],
      })
    );

    await expect(context.run()).rejects.toBeInstanceOf(DataError);

    expect(doubles.insertOne).not.toHaveBeenCalled();
  });

  it("refuses more than ten children per node", async () => {
    doubles.execute.mockResolvedValue(
      launchResult({
        launches: Array.from({ length: 11 }, (_, i) => childRequest(`c${i}`)),
      })
    );

    await expect(context.run()).rejects.toThrow("at most 10 child launches");

    expect(doubles.insertOne).not.toHaveBeenCalled();
  });

  it("refuses a deploy sharing the parent's concurrency scope, which could deadlock", async () => {
    deploys.set(
      DEPLOY("child", "user-test"),
      JSON.stringify({
        ...deployFixture(),
        scope: { id: "scope-test", activated: true, maxConcurrent: 1 },
      })
    );
    doubles.execute.mockResolvedValue(launchResult());

    await expect(context.run()).rejects.toThrow("concurrency scope");

    expect(doubles.insertOne).not.toHaveBeenCalled();
  });

  it("releases the key and stops the child when starting it failed, so a retry can start it", async () => {
    doubles.insertOne.mockRejectedValue(new Error("Mongo is down"));
    doubles.execute.mockResolvedValue(launchResult());

    await expect(context.run()).rejects.toThrow("Mongo is down");

    const child = insertedLaunch()["_id"] as string;
    await interrupted(child);
    expect(await liveState.children(context.launch._id, "echo_node")).toEqual(
      {}
    );
  });

  it("interrupts children started while the parent was being interrupted", async () => {
    // the parent is interrupted while its child is being stored
    doubles.insertOne.mockImplementation(() =>
      liveState.interrupt(context.launch._id)
    );
    doubles.execute.mockResolvedValue(launchResult());

    await expect(context.run()).rejects.toBeInstanceOf(DelayedError);

    await interrupted(insertedLaunch()["_id"] as string);
  });
});
