import {
  doubles,
  liveState,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME } from "../../fixtures/launch";
import { pipelineFixture } from "../../fixtures/pipeline";
import { DelayedError } from "bullmq";
import { DEPLOY } from "consts/redis";
import { createLogger } from "core-kit/packages/logger";
import type { Job } from "core-kit/packages/queue";
import { toInstance } from "core-kit/packages/transform";
import {
  FatalError,
  MemoryLimitError,
  TimeoutError,
} from "core-kit/types/errors";
import {
  applyFailure,
  applyOutcome,
  NodeRun,
} from "jobs/process-node/apply-outcome";
import { NodeOutcome, toOutcome } from "packages/nodes/outcome";
import { ChildLaunchRequest, NextNode, NodeJobResult } from "types/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const NOW = EXECUTION_TIME.getTime();
const JSON_RESULT = JSON.stringify({ enabled: false, count: 0 }, null, "  ");

let context: ReturnType<typeof nodeExecutionFixture>;

const logger = createLogger("outcomes-test");
const notify = { node: vi.fn(), pipeline: vi.fn(), user: vi.fn() };

function nodeRun(): NodeRun {
  return {
    launch: context.launch,
    node: "echo_node",
    job: context.job as unknown as Job,
    attempt: 0,
    startedAt: new Date(NOW - 250),
    dueAt: NOW - 1250,
    finishedAt: NOW,
  };
}

function next(result: object = {}): NodeOutcome {
  return {
    type: "next",
    next: toInstance(
      { outputs: { result: { enabled: false, count: 0 } }, ...result },
      NextNode
    ),
  };
}

function childLaunch(): NodeOutcome {
  return {
    type: "launch",
    launches: [
      toInstance(
        { key: "summary", deploy: { prefix: "user-test", slug: "child" } },
        ChildLaunchRequest
      ),
    ],
    delay: 3000,
  };
}

// what applying an outcome returned or threw
async function apply(outcome: NodeOutcome) {
  return applyOutcome(nodeRun(), outcome, { logger, notify }).then(
    (result) => ({ result }),
    (error: unknown) => ({ error })
  );
}

// the Node jobs planned, by queue
function planned() {
  return Object.fromEntries(
    (["rapid", "regular", "deferred", "protracted"] as const)
      .map((queue) => [queue, doubles.plans[queue].mock.calls] as const)
      .filter(([, calls]) => calls.length > 0)
  );
}

function sentResults(stream: "nodeRuns" | "launchRuns") {
  return doubles.metrics[stream].mock.calls.map(
    ([row]) =>
      (row as { result?: string; status?: string }).result ?? row.status
  );
}

async function echoState() {
  const { _id } = context.launch;
  return {
    status: await liveState.status(_id, "echo_node"),
    processed: await liveState.isProcessed(_id, "echo_node"),
    state: await liveState.state(_id, "echo_node"),
    progress: await liveState.progress(_id, "echo_node"),
    dueAt: await liveState.dueAt(_id, "echo_node", "job-test"),
    finished: await liveState.isFinished(context.launch),
  };
}

const unchanged = {
  status: null,
  processed: false,
  state: null,
  progress: null,
  dueAt: null,
  finished: false,
};

beforeEach(async () => {
  resetExecutionDoubles();
  for (const mock of Object.values(notify)) {
    mock.mockReset();
  }
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
  context = nodeExecutionFixture();
  await context.store();
  const deploy = {
    _id: "deploy-child",
    prefix: "user-test",
    slug: "child",
    project: { _id: "project-child", title: "Child project" },
    pipeline: pipelineFixture(),
  };
  doubles.redis.get.mockImplementation(async (key: string) =>
    key === DEPLOY("child", "user-test") ? JSON.stringify(deploy) : null
  );
});

describe("applying a Node's outcome", () => {
  it.each([
    {
      name: "next completes the node, plans the next one and finishes the launch",
      outcome: next(),
      returned: { result: NodeJobResult.NODE_PROCESSED },
      state: {
        ...unchanged,
        status: { state: "done" },
        processed: true,
        finished: true,
      },
      plans: {
        regular: [
          [{ launch: "launch-test", node: "sink_node" }, { delay: 1000 }],
        ],
      },
      delayedTo: null,
      children: 0,
      nodeRuns: ["done"],
      launchRuns: ["done"],
    },
    {
      name: "a looping next completes the node without locking it",
      outcome: next({
        behavior: "loop",
        outputs: undefined,
        kicks: ["sink_node"],
      }),
      returned: { result: NodeJobResult.NODE_PROCESSED },
      state: { ...unchanged, status: { state: "done" } },
      plans: {
        regular: [
          [{ launch: "launch-test", node: "sink_node" }, { delay: 1000 }],
        ],
      },
      delayedTo: null,
      children: 0,
      nodeRuns: ["done"],
      launchRuns: [],
    },
    {
      name: "repeat keeps state and progress and delays the job",
      outcome: {
        type: "repeat",
        delay: 2500,
        state: { page: 2 },
        progress: { total: 10, processed: 2 },
      },
      returned: { error: expect.any(DelayedError) },
      state: {
        ...unchanged,
        state: { page: 2 },
        progress: { total: 10, processed: 2 },
        dueAt: NOW + 2500,
      },
      plans: {},
      delayedTo: NOW + 2500,
      children: 0,
      nodeRuns: ["repeat"],
      launchRuns: [],
    },
    {
      name: "repeat without a delay runs again after a second",
      outcome: { type: "repeat" },
      returned: { error: expect.any(DelayedError) },
      state: { ...unchanged, dueAt: NOW + 1000 },
      plans: {},
      delayedTo: NOW + 1000,
      children: 0,
      nodeRuns: ["repeat"],
      launchRuns: [],
    },
    {
      name: "launch starts the Child Launches and delays the job",
      outcome: childLaunch(),
      returned: { error: expect.any(DelayedError) },
      state: { ...unchanged, dueAt: NOW + 3000 },
      // the child's start node
      plans: {
        rapid: [[{ launch: expect.any(String), node: "echo_node" }, {}]],
      },
      delayedTo: NOW + 3000,
      children: 1,
      nodeRuns: ["repeat"],
      launchRuns: [],
    },
    {
      name: "a timeout error fails the run",
      outcome: { type: "error", error: new TimeoutError("too slow") },
      returned: { error: expect.any(TimeoutError) },
      state: unchanged,
      plans: {},
      delayedTo: null,
      children: 0,
      nodeRuns: ["timeout"],
      launchRuns: [],
    },
    {
      name: "a memory error fails the run",
      outcome: { type: "error", error: new MemoryLimitError("too big") },
      returned: { error: expect.any(MemoryLimitError) },
      state: unchanged,
      plans: {},
      delayedTo: null,
      children: 0,
      nodeRuns: ["memory"],
      launchRuns: [],
    },
    {
      name: "any other error fails the run",
      outcome: { type: "error", error: new Error("broken") },
      returned: { error: new Error("broken") },
      state: unchanged,
      plans: {},
      delayedTo: null,
      children: 0,
      nodeRuns: ["error"],
      launchRuns: [],
    },
  ] satisfies {
    name: string;
    outcome: NodeOutcome;
    returned: object;
    state: object;
    plans: object;
    delayedTo: number | null;
    children: number;
    nodeRuns: string[];
    launchRuns: string[];
  }[])(
    "$name",
    async ({
      outcome,
      returned,
      state,
      plans,
      delayedTo,
      children,
      nodeRuns,
      launchRuns,
    }) => {
      const applied = await apply(outcome);

      expect(applied).toEqual(returned);
      expect(await echoState()).toEqual(state);
      expect(planned()).toEqual(plans);
      expect(context.job.moveToDelayed.mock.calls).toEqual(
        delayedTo === null ? [] : [[delayedTo]]
      );
      expect(doubles.insertOne).toHaveBeenCalledTimes(children);
      expect(sentResults("nodeRuns")).toEqual(nodeRuns);
      expect(sentResults("launchRuns")).toEqual(launchRuns);
    }
  );

  it("records a failed start of Child Launches as an error run", async () => {
    doubles.redis.get.mockResolvedValue(null);

    const applied = await apply(childLaunch());

    expect(applied).toEqual({ error: expect.any(Error) });
    expect(context.job.moveToDelayed).not.toHaveBeenCalled();
    expect(sentResults("nodeRuns")).toEqual(["error"]);
  });

  it("leaves the scope and tells the user when the launch finishes", async () => {
    await apply(next());

    expect((await liveState.scopeQueue("scope-test", 10)).waiting).toBe(0);
    expect(doubles.metrics.finished).toHaveBeenCalledExactlyOnceWith({
      launch: "launch-test",
      finishedAt: EXECUTION_TIME,
      fromStart: 5,
    });
    expect(notify.user).toHaveBeenCalledWith(
      "pipeline_done",
      expect.objectContaining({ launch: "launch-test" })
    );
    expect(await liveState.output(context.launch, "result")).toBe(JSON_RESULT);
  });
});

describe("applying a failed attempt", () => {
  it.each([
    {
      name: "an error with attempts left retries the node",
      error: new Error("temporary"),
      attemptsMade: 1,
      errors: [],
      dueAt: NOW,
      launchRuns: [],
      removed: false,
    },
    {
      name: "an error on the last attempt fails the launch",
      error: new Error("permanent"),
      attemptsMade: 3,
      errors: ["permanent"],
      dueAt: null,
      launchRuns: ["error"],
      removed: false,
    },
    {
      name: "a fatal error fails the launch at once",
      error: new FatalError("cannot continue"),
      attemptsMade: 0,
      errors: ["cannot continue"],
      dueAt: null,
      launchRuns: ["error"],
      removed: true,
    },
  ])(
    "$name",
    async ({ error, attemptsMade, errors, dueAt, launchRuns, removed }) => {
      context.job.attemptsMade = attemptsMade;

      await applyFailure(
        {
          launch: context.launch,
          node: "echo_node",
          job: context.job as unknown as Job,
        },
        error,
        { logger, notify }
      );

      const { _id } = context.launch;
      expect(await liveState.status(_id, "echo_node")).toEqual({
        state: "error",
        error: error.message,
      });
      expect(await liveState.errors(_id)).toEqual(errors);
      expect(await liveState.dueAt(_id, "echo_node", "job-test")).toBe(dueAt);
      expect(doubles.plans.errors).toHaveBeenCalledTimes(errors.length);
      expect(sentResults("launchRuns")).toEqual(launchRuns);
      expect(context.job.remove).toHaveBeenCalledTimes(removed ? 1 : 0);
      expect(notify.node).toHaveBeenCalledExactlyOnceWith(
        "echo_node",
        "node_error"
      );
    }
  );
});

describe("a run's result as an outcome", () => {
  it.each([
    {
      result: { __type: "repeat", delay: 5, state: { page: 1 } },
      outcome: { type: "repeat", delay: 5, state: { page: 1 } },
    },
    {
      result: { __type: "repeat", progress: { total: 2, processed: 1 } },
      outcome: {
        type: "repeat",
        delay: undefined,
        progress: { total: 2, processed: 1 },
      },
    },
    {
      result: {
        __type: "launch",
        launches: [{ key: "a", deploy: { slug: "child" } }],
      },
      outcome: {
        type: "launch",
        launches: [{ key: "a", deploy: { slug: "child" } }],
        delay: undefined,
      },
    },
    {
      result: { __type: "next", outputs: { result: "x" }, kicks: ["b"] },
      outcome: {
        type: "next",
        next: expect.objectContaining({
          outputs: new Map([["result", "x"]]),
          kicks: ["b"],
          behavior: "normal",
          delay: 1000,
        }),
      },
    },
    {
      result: { __type: "unknown" },
      outcome: {
        type: "error",
        error: new Error('Wrong handler results {"__type":"unknown"}'),
      },
    },
    {
      result: null,
      outcome: {
        type: "error",
        error: new Error("Wrong handler results null"),
      },
    },
  ])("reads $result", ({ result, outcome }) => {
    expect(toOutcome(result)).toEqual(outcome);
  });
});
