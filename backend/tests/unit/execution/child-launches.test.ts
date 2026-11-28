import {
  doubles,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME, launchFixture } from "../../fixtures/launch";
import { pipelineFixture } from "../../fixtures/pipeline";
import {
  DEPLOY,
  LAUNCH,
  LAUNCH_EXPIRED,
  LAUNCH_INTERRUPTED,
  NODE_CHILDREN,
  PIPELINE_OUTPUT,
} from "consts/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { PipelineOutput } from "models/pipeline";
import { DataError, FatalError } from "core-kit/types/errors";
import { DelayedError } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

let context: ReturnType<typeof nodeExecutionFixture>;

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

function startedChild(output: string | null) {
  const child = launchFixture();
  child._id = "child-1";
  context.responses.set(
    NODE_CHILDREN(context.launch._id, "echo_node"),
    JSON.stringify({ summary: "child-1" })
  );
  context.responses.set(LAUNCH("child-1"), JSON.stringify(toPlain(child)));
  if (output !== null) {
    context.responses.set(PIPELINE_OUTPUT("child-1", "result"), output);
  }
}

function payload() {
  return doubles.execute.mock.calls[0][2] as Record<string, unknown>;
}

function childRequest(key: string, slug = "child") {
  return { key, deploy: { prefix: "user-test", slug } };
}

function interrupted(launch: string) {
  expect(doubles.redis.setEx).toHaveBeenCalledWith(
    LAUNCH_INTERRUPTED(launch),
    LAUNCH_EXPIRED,
    EXECUTION_TIME.toISOString()
  );
}

function insertedLaunch() {
  return doubles.insertOne.mock.calls[0][0] as Record<string, unknown>;
}

beforeEach(() => {
  resetExecutionDoubles();
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
  context = nodeExecutionFixture();
  context.responses.set(
    DEPLOY("child", "user-test"),
    JSON.stringify(deployFixture())
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
    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      NODE_CHILDREN(context.launch._id, "echo_node"),
      LAUNCH_EXPIRED,
      JSON.stringify({ summary: child["_id"] })
    );
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
      startedChild(output);

      await context.run();

      expect(payload().children).toEqual({
        summary: { launch: "child-1", ...expected },
      });
    }
  );

  it("finishes a child whose pipeline has an output without flows", async () => {
    startedChild('{"answer":42}');
    const child = launchFixture();
    child._id = "child-1";
    child.pipeline.outputs.set(
      "unused",
      toInstance({ type: "string" }, PipelineOutput)
    );
    context.responses.set(LAUNCH("child-1"), JSON.stringify(toPlain(child)));

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
    startedChild(null);
    doubles.redis.lRange.mockResolvedValue(["Upstream API is down"]);

    const run = context.run();

    await expect(run).rejects.toBeInstanceOf(FatalError);
    await expect(run).rejects.toThrow(
      "Child launch summary (child-1) failed: Upstream API is down"
    );
    expect(doubles.execute).not.toHaveBeenCalled();
  });

  it("does not start a second child for a key the node already used", async () => {
    startedChild(null);
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
    context.responses.set(
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
    context.responses.set(
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
    await context.run();

    expect(doubles.redis.del).toHaveBeenCalledWith(
      NODE_CHILDREN(context.launch._id, "sink_node")
    );
  });

  it("interrupts the node's other children when one of them failed", async () => {
    startedChild(null);
    doubles.redis.lRange.mockResolvedValue(["Upstream API is down"]);

    await expect(context.run()).rejects.toBeInstanceOf(FatalError);

    interrupted("child-1");
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
    context.responses.set(
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
    interrupted(child);
    expect(doubles.redis.setEx).toHaveBeenLastCalledWith(
      NODE_CHILDREN(context.launch._id, "echo_node"),
      LAUNCH_EXPIRED,
      "{}"
    );
  });

  it("interrupts children started while the parent was being interrupted", async () => {
    doubles.redis.EXISTS.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    doubles.execute.mockResolvedValue(launchResult());

    await expect(context.run()).rejects.toBeInstanceOf(DelayedError);

    interrupted(insertedLaunch()["_id"] as string);
  });
});
