import {
  doubles,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME } from "../../fixtures/launch";
import {
  LAUNCH_EXPIRED,
  LAUNCH_HEARTBEAT,
  NODE_LOGS,
  NODE_PROCESSING_LOCK,
  NODE_STATE,
  NODE_STATUS,
} from "consts/redis";
import { toInstance } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { NodeExecution } from "enums/node-execution";
import { ExecutionError } from "packages/deno/classes";
import { beforeEach, describe, expect, it, vi } from "vitest";

let context: ReturnType<typeof nodeExecutionFixture>;

beforeEach(() => {
  resetExecutionDoubles();
  vi.useFakeTimers();
  vi.setSystemTime(EXECUTION_TIME);
  context = nodeExecutionFixture();
});

describe("node execution lifecycle", () => {
  it.each([
    [NodeExecution.rapid, 3000],
    [NodeExecution.regular, 20000],
    [NodeExecution.deferred, 60000],
    [NodeExecution.protracted, 300000],
  ] as const)(
    "uses the %s timeout and real input/state conversion",
    async (execution, timeout) => {
      context.launch.pipeline.nodes.get("echo_node").execution = execution;
      context.responses.set(
        NODE_STATE(context.launch._id, "echo_node"),
        '{"page":2}'
      );

      await context.run();

      expect(doubles.execute).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        "run",
        expect.objectContaining({
          inputs: { enabled: false, count: 0, text: "" },
          state: { page: 2 },
          env: { scope: {}, variables: {} },
        }),
        { timeout, isolation: "process" }
      );
      expect(doubles.redis.del).toHaveBeenCalledWith(
        NODE_PROCESSING_LOCK(context.launch._id, "echo_node")
      );
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it("runs signed nodes without process isolation", async () => {
    context.launch.pipeline.nodes.get("echo_node").sign = "trusted-signature";

    await context.run();

    expect(doubles.execute).toHaveBeenCalledWith(
      expect.any(String),
      "run",
      expect.any(Object),
      { timeout: 3000, isolation: "none" }
    );
  });

  it("keeps the heartbeat alive during execution and stops it afterwards", async () => {
    let finish: (result: object) => void;
    doubles.execute.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const running = context.run();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(10000);

    expect(
      doubles.redis.setEx.mock.calls.filter(
        ([key]) => key === LAUNCH_HEARTBEAT(context.launch._id)
      )
    ).toHaveLength(2);
    finish({ result: { __type: "next" }, logs: [] });
    await running;

    expect(vi.getTimerCount()).toBe(0);
  });

  it("stores logs with the current attempt and releases resources on success", async () => {
    context.job.attemptsMade = 2;
    doubles.execute.mockResolvedValue({
      result: { __type: "next" },
      logs: [{ message: "hello", level: "info" }],
    });

    await context.run();

    expect(doubles.redis.rPush).toHaveBeenCalledWith(
      NODE_LOGS(context.launch._id, "echo_node"),
      [JSON.stringify({ level: "info", message: "hello", attempt: 2 })]
    );
    expect(doubles.redis.expire).toHaveBeenCalledWith(
      NODE_LOGS(context.launch._id, "echo_node"),
      LAUNCH_EXPIRED
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not restart the heartbeat if a refresh finishes after execution", async () => {
    let finishExecution: (result: object) => void;
    let finishHeartbeat: () => void;
    let heartbeats = 0;
    doubles.execute.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishExecution = resolve;
        })
    );
    doubles.redis.setEx.mockImplementation((key: string) => {
      if (key === LAUNCH_HEARTBEAT(context.launch._id) && ++heartbeats === 2) {
        return new Promise<void>((resolve) => {
          finishHeartbeat = resolve;
        });
      }
      return undefined;
    });
    const running = context.run();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10000);

    finishExecution({ result: { __type: "next" }, logs: [] });
    await running;
    finishHeartbeat();
    await vi.advanceTimersByTimeAsync(0);

    expect(vi.getTimerCount()).toBe(0);
  });

  it("maps Deno errors to domain errors and retains their logs", async () => {
    doubles.execute.mockRejectedValue(
      toInstance(
        {
          message: "invalid input",
          code: "DATA_ERROR",
          details: { input: "text" },
          logs: [{ level: "error", message: "bad input" }],
        },
        ExecutionError
      )
    );

    await expect(context.run()).rejects.toBeInstanceOf(DataError);

    expect(doubles.redis.rPush).toHaveBeenCalledWith(
      NODE_LOGS(context.launch._id, "echo_node"),
      [JSON.stringify({ level: "error", message: "bad input", attempt: 0 })]
    );
    expect(doubles.redis.del).toHaveBeenCalledWith(
      NODE_PROCESSING_LOCK(context.launch._id, "echo_node")
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  function failSetEx(key: (launch: string, node: string) => string) {
    return (failure: Error) =>
      doubles.redis.setEx.mockImplementation(async (written: string) => {
        if (written === key(context.launch._id, "echo_node")) throw failure;
      });
  }

  it.each([
    {
      phase: "execute",
      fail: (failure: Error) => doubles.execute.mockRejectedValue(failure),
      releasesLock: true,
    },
    {
      phase: "lock",
      fail: failSetEx(NODE_PROCESSING_LOCK),
      releasesLock: false,
    },
    { phase: "status", fail: failSetEx(NODE_STATUS), releasesLock: true },
    {
      phase: "unlock",
      fail: (failure: Error) => doubles.redis.del.mockRejectedValue(failure),
      releasesLock: true,
    },
    {
      phase: "heartbeat",
      fail: (failure: Error) => doubles.redis.setEx.mockRejectedValue(failure),
      releasesLock: false,
    },
  ])(
    "cleans up timers after a failure in $phase",
    async ({ phase, fail, releasesLock }) => {
      const failure = new Error(`${phase} failed`);
      fail(failure);

      await expect(context.run()).rejects.toBe(failure);

      expect(vi.getTimerCount()).toBe(0);
      expect(
        doubles.redis.del.mock.calls.some(
          ([key]) =>
            key === NODE_PROCESSING_LOCK(context.launch._id, "echo_node")
        )
      ).toBe(releasesLock);
    }
  );

  it("rejects malformed execution results after releasing the lock", async () => {
    doubles.execute.mockResolvedValue({
      result: { unexpected: true },
      logs: [],
    });

    await expect(context.run()).rejects.toThrow("Wrong handler results");

    expect(doubles.redis.del).toHaveBeenCalledWith(
      NODE_PROCESSING_LOCK(context.launch._id, "echo_node")
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
