import {
  doubles,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME } from "../../fixtures/launch";
import { LAUNCH_EXPIRED, NODE_STATUS, PIPELINE_ERRORS } from "consts/redis";
import type { Job } from "core-kit/packages/queue";
import {
  FatalError,
  MemoryLimitError,
  TimeoutError,
} from "core-kit/types/errors";
import errorHandler from "jobs/process-node/process-node-error";
import { beforeEach, describe, expect, it, vi } from "vitest";

let context: ReturnType<typeof nodeExecutionFixture>;

beforeEach(() => {
  resetExecutionDoubles();
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
  context = nodeExecutionFixture();
});

describe("worker execution error reporting", () => {
  it("records retryable failures without terminating the launch early", async () => {
    const error = new Error("temporary failure");

    await errorHandler(context.nodeJob, error, context.job as unknown as Job);

    expect(doubles.redis.setEx).toHaveBeenCalledWith(
      NODE_STATUS(context.launch._id, "echo_node"),
      LAUNCH_EXPIRED,
      '{"state":"error","error":"temporary failure"}'
    );
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
      context.launch._id,
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

    expect(doubles.redis.rPush).toHaveBeenCalledWith(
      PIPELINE_ERRORS(context.launch._id),
      "failed permanently"
    );
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
        failure,
        context.job as unknown as Job
      );

      expect(doubles.redis.lPush).toHaveBeenCalledWith(
        PIPELINE_ERRORS(context.launch._id),
        "cannot continue"
      );
      expect(doubles.plans.errors).toHaveBeenCalledExactlyOnceWith({
        launch: context.launch._id,
      });
      expect(context.job.remove).toHaveBeenCalledOnce();
      expect(doubles.captureException).not.toHaveBeenCalled();
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
    doubles.redis.get.mockResolvedValue(null);

    await errorHandler(
      context.nodeJob,
      new Error("expired"),
      context.job as unknown as Job
    );

    expect(doubles.redis.setEx).not.toHaveBeenCalled();
    expect(doubles.metrics.errors).not.toHaveBeenCalled();
    expect(doubles.notify).not.toHaveBeenCalled();
  });
});
