import {
  doubles,
  liveState,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { spyOnLiveState } from "../../helpers/live-state";
import { EXECUTION_TIME } from "../../fixtures/launch";
import type { Job } from "core-kit/packages/queue";
import { toInstance } from "core-kit/packages/transform";
import { FatalError } from "core-kit/types/errors";
import errorHandler from "jobs/process-node/process-node-error";
import {
  recordLaunchRun,
  recordNodeExecution,
} from "packages/launches/run-metrics";
import { ExecutionError } from "packages/deno/classes";
import { NodeJobResult } from "types/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const NOW = EXECUTION_TIME.getTime();

let context: ReturnType<typeof nodeExecutionFixture>;

function withJobTiming(timestamp: number, delay?: number) {
  Object.assign(context.job, { timestamp, opts: { attempts: 3, delay } });
}

function executeFor(ms: number, result: object) {
  doubles.execute.mockImplementation(async () => {
    vi.advanceTimersByTime(ms);
    return { result, logs: [] };
  });
}

beforeEach(async () => {
  resetExecutionDoubles();
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
  context = nodeExecutionFixture();
  await context.store();
});

function dueAt() {
  return liveState.dueAt(context.launch._id, "echo_node", context.job.id);
}

describe("node run metrics", () => {
  it("records a finished run with wait and execution time", async () => {
    withJobTiming(NOW - 1500, 500);
    executeFor(250, { __type: "next", outputs: {} });

    await context.run();

    expect(doubles.metrics.nodeRuns).toHaveBeenCalledExactlyOnceWith({
      startedAt: EXECUTION_TIME,
      launch: context.launch._id,
      project: "project-test",
      pipeline: context.launch.pipeline.name,
      node: "echo_node",
      launchedBy: "user-test",
      execution: "rapid",
      attempt: 0,
      result: "done",
      waitMs: 1000,
      durationMs: 250,
    });
  });

  it("records a repeat and measures the next wait from the repeat time", async () => {
    withJobTiming(NOW);
    executeFor(100, { __type: "repeat", delay: 2000 });

    await expect(context.run()).rejects.toThrow();

    expect(doubles.metrics.nodeRuns).toHaveBeenCalledWith(
      expect.objectContaining({ result: "repeat", durationMs: 100 })
    );
    expect(await dueAt()).toBe(NOW + 100 + 2000);
  });

  it("measures the wait from a stored due time", async () => {
    withJobTiming(NOW - 60_000);
    await liveState.nodeRepeats(
      context.launch._id,
      "echo_node",
      context.job.id,
      {
        dueAt: NOW - 300,
      }
    );

    await context.run();

    expect(doubles.metrics.nodeRuns).toHaveBeenCalledWith(
      expect.objectContaining({ result: "done", waitMs: 300 })
    );
  });

  it.each([
    ["TIMEOUT_ERROR", "timeout"],
    ["MEMORY_LIMIT_ERROR", "memory"],
    ["DATA_ERROR", "error"],
  ])("records a %s failure as %s", async (code, result) => {
    doubles.execute.mockRejectedValue(
      toInstance({ message: "failed", code, logs: [] }, ExecutionError)
    );

    await expect(context.run()).rejects.toThrow("failed");

    expect(doubles.metrics.nodeRuns).toHaveBeenCalledWith(
      expect.objectContaining({ result })
    );
  });

  it.each([
    {
      name: "records a failed run and fails with its error",
      run: () =>
        doubles.execute.mockRejectedValue(
          toInstance(
            {
              message: "too slow",
              code: "TIMEOUT_ERROR",
              logs: [{ ts: NOW, level: "info", message: "started" }],
            },
            ExecutionError
          )
        ),
      error: "too slow",
      results: ["timeout"],
    },
    {
      name: "fails a successful run before applying it",
      run: () =>
        doubles.execute.mockResolvedValue({
          result: { __type: "next", outputs: {} },
          logs: [{ ts: NOW, level: "info", message: "done" }],
        }),
      error: "logs unavailable",
      results: [],
    },
  ])(
    "when its logs cannot be stored, $name",
    async ({ run, error, results }) => {
      run();
      spyOnLiveState("appendLogs").mockRejectedValue(
        new Error("logs unavailable")
      );

      await expect(context.run()).rejects.toThrow(error);

      expect(
        doubles.metrics.nodeRuns.mock.calls.map(
          ([row]) => (row as { result: string }).result
        )
      ).toEqual(results);
    }
  );

  it("records unexpected script results as errors", async () => {
    doubles.execute.mockResolvedValue({ result: { __type: "?" }, logs: [] });

    await expect(context.run()).rejects.toThrow("Wrong handler results");

    expect(doubles.metrics.nodeRuns).toHaveBeenCalledWith(
      expect.objectContaining({ result: "error" })
    );
  });
});

describe("launch run metrics", () => {
  it("records a done launch with queue and run time", async () => {
    context.launch.startedAt = new Date(NOW - 2000);

    await context.run();

    expect(await liveState.markRunRecorded(context.launch._id, "error")).toBe(
      false
    );
    expect(doubles.metrics.launchRuns).toHaveBeenCalledExactlyOnceWith({
      launchedAt: context.launch.launchedAt,
      startedAt: new Date(NOW - 2000),
      finishedAt: EXECUTION_TIME,
      launch: context.launch._id,
      project: "project-test",
      pipeline: context.launch.pipeline.name,
      launchedBy: "user-test",
      scope: "scope-test",
      status: "done",
      queuedMs: 3000,
      durationMs: 2000,
    });
  });

  it("records an interrupted launch at the interrupt time", async () => {
    const interruptedAt = new Date(NOW - 700);
    await liveState.interrupt(context.launch._id, interruptedAt);

    const result = await context.run();

    expect(result).toBe(NodeJobResult.LAUNCH_INTERRUPTED);
    expect(doubles.execute).not.toHaveBeenCalled();
    expect(doubles.metrics.launchRuns).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        status: "interrupted",
        finishedAt: interruptedAt,
      })
    );
  });

  it("records an error launch after the last attempt", async () => {
    context.job.attemptsMade = 3;

    await errorHandler(
      context.nodeJob,
      new Error("failed permanently"),
      context.job as unknown as Job
    );

    expect(doubles.metrics.launchRuns).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: "error", finishedAt: EXECUTION_TIME })
    );
  });

  it("records an error launch on a fatal failure", async () => {
    await errorHandler(
      context.nodeJob,
      new FatalError("cannot continue"),
      context.job as unknown as Job
    );

    expect(doubles.metrics.launchRuns).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" })
    );
  });

  it("keeps a retried launch open and counts the backoff as wait", async () => {
    await errorHandler(
      context.nodeJob,
      new Error("temporary failure"),
      context.job as unknown as Job
    );

    expect(doubles.metrics.launchRuns).not.toHaveBeenCalled();
    expect(await dueAt()).toBe(NOW);
  });

  it("sends only the first outcome of a launch", async () => {
    await liveState.markRunRecorded(context.launch._id, "done");

    await recordLaunchRun(context.launch, "error");

    expect(doubles.metrics.launchRuns).not.toHaveBeenCalled();
  });
});

describe("node execution records", () => {
  // an open execution with two invocations so far
  async function openExecution() {
    await liveState.addInvocation(context.launch._id, "echo_node", {
      startedAt: new Date(NOW - 60_000),
      finishedAt: NOW - 50_000,
      waitMs: 120,
      durationMs: 100,
      attempt: 0,
    });
    await liveState.addInvocation(context.launch._id, "echo_node", {
      startedAt: new Date(NOW - 1000),
      finishedAt: NOW - 500,
      waitMs: 900,
      durationMs: 200,
      attempt: 0,
    });
  }

  it("records the open execution when the node is done", async () => {
    await openExecution();

    await context.run();

    // the run that completes the node is its third invocation
    expect(doubles.metrics.nodeExecutions).toHaveBeenCalledExactlyOnceWith({
      startedAt: new Date(NOW - 60_000),
      finishedAt: EXECUTION_TIME,
      launch: context.launch._id,
      project: "project-test",
      pipeline: context.launch.pipeline.name,
      node: "echo_node",
      launchedBy: "user-test",
      execution: "rapid",
      result: "done",
      waitMs: 120,
      durationMs: 60_000,
      activeMs: 300,
      invocations: 3,
      attempts: 1,
    });
    expect(
      await liveState.closeExecution(context.launch._id, "echo_node")
    ).toBeNull();
  });

  it("keeps the execution open on a repeat", async () => {
    await openExecution();
    executeFor(100, { __type: "repeat", delay: 2000 });

    await expect(context.run()).rejects.toThrow();

    expect(doubles.metrics.nodeExecutions).not.toHaveBeenCalled();
  });

  it("keeps the execution open on an error with attempts left", async () => {
    await openExecution();

    await errorHandler(
      context.nodeJob,
      new Error("temporary failure"),
      context.job as unknown as Job
    );

    expect(doubles.metrics.nodeExecutions).not.toHaveBeenCalled();
  });

  it.each([
    ["the last attempt", new Error("failed permanently"), 3, "error"],
    ["a fatal failure", new FatalError("cannot continue"), 0, "error"],
  ])("records the execution on %s", async (_, error, attemptsMade, result) => {
    await openExecution();
    context.job.attemptsMade = attemptsMade;

    await errorHandler(context.nodeJob, error, context.job as unknown as Job);

    expect(doubles.metrics.nodeExecutions).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ result, finishedAt: new Date(NOW - 500) })
    );
  });

  it("records the execution as interrupted at the interrupt time", async () => {
    await openExecution();
    const interruptedAt = new Date(NOW - 700);
    await liveState.interrupt(context.launch._id, interruptedAt);

    await context.run();

    expect(doubles.metrics.nodeExecutions).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        result: "interrupted",
        finishedAt: interruptedAt,
        durationMs: 59_300,
      })
    );
  });

  it("sends nothing without an open execution", async () => {
    await recordNodeExecution(context.launch, "echo_node", "error");

    expect(doubles.metrics.nodeExecutions).not.toHaveBeenCalled();
  });
});
