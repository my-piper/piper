import {
  doubles,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME } from "../../fixtures/launch";
import {
  LAUNCH_EXPIRED,
  LAUNCH_INTERRUPTED,
  LAUNCH_RUN_RECORDED,
  NODE_JOB_DUE,
} from "consts/redis";
import type { Job } from "core-kit/packages/queue";
import { toInstance } from "core-kit/packages/transform";
import { FatalError } from "core-kit/types/errors";
import errorHandler from "jobs/process-node/process-node-error";
import { recordLaunchRun } from "jobs/process-node/run-metrics";
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

beforeEach(() => {
  resetExecutionDoubles();
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
  context = nodeExecutionFixture();
});

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
    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      NODE_JOB_DUE(context.launch._id, "echo_node", context.job.id),
      LAUNCH_EXPIRED,
      String(NOW + 100 + 2000)
    );
  });

  it("measures the wait from a stored due time", async () => {
    withJobTiming(NOW - 60_000);
    context.responses.set(
      NODE_JOB_DUE(context.launch._id, "echo_node", context.job.id),
      String(NOW - 300)
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

    expect(doubles.redis.set).toHaveBeenCalledWith(
      LAUNCH_RUN_RECORDED(context.launch._id),
      "done",
      { NX: true, EX: LAUNCH_EXPIRED }
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
    doubles.redis.EXISTS.mockImplementation(async (key: string) =>
      key === LAUNCH_INTERRUPTED(context.launch._id) ? 1 : 0
    );
    context.responses.set(
      LAUNCH_INTERRUPTED(context.launch._id),
      interruptedAt.toISOString()
    );

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
    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      NODE_JOB_DUE(context.launch._id, "echo_node", context.job.id),
      LAUNCH_EXPIRED,
      String(NOW)
    );
  });

  it("sends only the first outcome of a launch", async () => {
    doubles.redis.set.mockResolvedValue(null);

    await recordLaunchRun(context.launch, "error");

    expect(doubles.metrics.launchRuns).not.toHaveBeenCalled();
  });
});
