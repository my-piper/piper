import {
  doubles,
  liveState,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME } from "../../fixtures/launch";
import type { Job } from "core-kit/packages/queue";
import {
  FatalError,
  MemoryLimitError,
  TimeoutError,
} from "core-kit/types/errors";
import errorHandler from "jobs/process-node/process-node-error";
import { beforeEach, describe, expect, it, vi } from "vitest";

let context: ReturnType<typeof nodeExecutionFixture>;

beforeEach(async () => {
  resetExecutionDoubles();
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
  context = nodeExecutionFixture();
  await context.store();
});

describe("worker execution error reporting", () => {
  it("records retryable failures without terminating the launch early", async () => {
    const error = new Error("temporary failure");

    await errorHandler(context.nodeJob, error, context.job as unknown as Job);

    expect(await liveState.status(context.launch._id, "echo_node")).toEqual({
      state: "error",
      error: "temporary failure",
    });
    expect(await liveState.errors(context.launch._id)).toEqual([]);
    expect(
      await liveState.dueAt(context.launch._id, "echo_node", "job-test")
    ).toBe(EXECUTION_TIME.getTime());
    expect(doubles.metrics.errors).toHaveBeenCalledWith(
      expect.objectContaining({
        launch: context.launch._id,
        message: error.message,
        attempt: 0,
        maxAttempts: 3,
        occurredAt: EXECUTION_TIME,
      })
    );
    expect(doubles.notify).toHaveBeenCalledWith(
      `launch:${context.launch._id}`,
      "node_error",
      expect.objectContaining({ node: "echo_node" })
    );
    expect(doubles.captureException).toHaveBeenCalledWith(
      error,
      expect.any(Object)
    );
    expect(doubles.plans.errors).not.toHaveBeenCalled();
    expect(context.job.remove).not.toHaveBeenCalled();
  });

  it("stores a launch error after the last attempt", async () => {
    context.job.attemptsMade = 3;

    await errorHandler(
      context.nodeJob,
      new Error("failed permanently"),
      context.job as unknown as Job
    );

    expect(await liveState.errors(context.launch._id)).toEqual([
      "failed permanently",
    ]);
    expect(doubles.plans.errors).toHaveBeenCalledExactlyOnceWith({
      launch: context.launch._id,
    });
  });

  it.each([FatalError, TimeoutError, MemoryLimitError])(
    "terminates %s failures immediately",
    async (ErrorType) => {
      const failure = new ErrorType("cannot continue");
      await errorHandler(
        context.nodeJob,
        new Error("earlier failure"),
        Object.assign({}, context.job, { attemptsMade: 3 }) as unknown as Job
      );

      await errorHandler(
        context.nodeJob,
        failure,
        context.job as unknown as Job
      );

      expect(await liveState.errors(context.launch._id)).toEqual([
        "cannot continue",
        "earlier failure",
      ]);
      expect(doubles.plans.errors).toHaveBeenLastCalledWith({
        launch: context.launch._id,
      });
      expect(context.job.remove).toHaveBeenCalledOnce();
      expect(doubles.captureException).toHaveBeenCalledOnce();
    }
  );

  it.each([FatalError, TimeoutError, MemoryLimitError])(
    "records a %s failure on the last attempt once",
    async (ErrorType) => {
      context.job.attemptsMade = 3;
      const failure = new ErrorType("cannot continue");

      await errorHandler(
        context.nodeJob,
        failure,
        context.job as unknown as Job
      );

      expect(await liveState.errors(context.launch._id)).toEqual([
        "cannot continue",
      ]);
      expect(doubles.plans.errors).toHaveBeenCalledExactlyOnceWith({
        launch: context.launch._id,
      });
      expect(context.job.remove).toHaveBeenCalledOnce();
    }
  );

  it("does not mask a fatal failure when removing a locked job fails", async () => {
    context.job.remove.mockRejectedValue(new Error("job is locked"));

    await errorHandler(
      context.nodeJob,
      new FatalError("cannot continue"),
      context.job as unknown as Job
    );

    expect(doubles.plans.errors).toHaveBeenCalledOnce();
    expect(context.job.remove).toHaveBeenCalledOnce();
  });

  it("does nothing when the launch has expired", async () => {
    vi.advanceTimersByTime(8 * 24 * 3600 * 1000);

    await errorHandler(
      context.nodeJob,
      new Error("expired"),
      context.job as unknown as Job
    );

    expect(await liveState.status(context.launch._id, "echo_node")).toBeNull();
    expect(doubles.metrics.errors).not.toHaveBeenCalled();
    expect(doubles.notify).not.toHaveBeenCalled();
  });
});
