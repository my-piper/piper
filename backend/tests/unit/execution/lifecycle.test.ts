import {
  doubles,
  liveState,
  resetExecutionDoubles,
} from "../../helpers/execution-boundaries";
import { spyOnLiveState } from "../../helpers/live-state";
import { nodeExecutionFixture } from "../../helpers/node-execution";
import { EXECUTION_TIME } from "../../fixtures/launch";
import { GLOBAL_ENVIRONMENT_KEY } from "consts/redis";
import { toInstance, toPlain } from "core-kit/packages/transform";
import { DataError } from "core-kit/types/errors";
import { NodeExecution } from "enums/node-execution";
import { Environment } from "models/environment";
import { NodeEnvironment } from "models/node";
import { ExecutionError } from "packages/deno/classes";
import { encrypt } from "packages/environment/crypt-environment";
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
      await liveState.nodeRepeats(context.launch._id, "echo_node", "job-0", {
        dueAt: 0,
        state: { page: 2 },
      });

      await context.run();

      expect(doubles.execute).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        "run",
        expect.objectContaining({
          inputs: { enabled: false, count: 0, text: "" },
          state: { page: 2 },
          env: { scope: {}, variables: {} },
        }),
        { timeout, isolation: "none" }
      );
      expect(
        await liveState.isProcessing(context.launch._id, "echo_node")
      ).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it("runs a Node marked isolated in its own process", async () => {
    context.launch.pipeline.nodes.get("echo_node").isolated = true;

    await context.run();

    expect(doubles.execute).toHaveBeenCalledWith(
      expect.any(String),
      "run",
      expect.any(Object),
      { timeout: 3000, isolation: "process" }
    );
  });

  it("runs a Script Node without isolation and with its Environment", async () => {
    const node = context.launch.pipeline.nodes.get("echo_node");
    Object.assign(node, {
      source: "script",
      environment: new Map([["OPENAI_KEY", toInstance({}, NodeEnvironment)]]),
    });
    const global = toInstance(
      { variables: { OPENAI_KEY: "platform secret" } },
      Environment
    );
    encrypt(global);
    doubles.redis.get.mockImplementation(async (key: string) =>
      key === GLOBAL_ENVIRONMENT_KEY ? JSON.stringify(toPlain(global)) : null
    );

    await context.run();

    expect(doubles.execute).toHaveBeenCalledWith(
      expect.any(String),
      "run",
      expect.objectContaining({
        env: {
          scope: { OPENAI_KEY: "global" },
          variables: { OPENAI_KEY: "platform secret" },
        },
      }),
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
    const beat = spyOnLiveState("beat");
    const running = context.run();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(10000);

    expect(beat).toHaveBeenCalledTimes(2);
    expect(await liveState.heartbeat(context.launch._id)).toBe(
      new Date(EXECUTION_TIME.getTime() + 10000).toISOString()
    );
    finish({ result: { __type: "next" }, logs: [] });
    await running;

    expect(vi.getTimerCount()).toBe(0);
  });

  it("stores logs with the current attempt and releases resources on success", async () => {
    context.job.attemptsMade = 2;
    doubles.execute.mockResolvedValue({
      result: { __type: "next" },
      logs: [{ ts: 1767323045000, message: "hello", level: "info" }],
    });

    await context.run();

    expect(await liveState.logs(context.launch._id, "echo_node")).toEqual({
      lines: [
        { level: "info", message: "hello", attempt: 2, ts: 1767323045000 },
      ],
      dropped: 0,
    });
    expect(await liveState.isProcessing(context.launch._id, "echo_node")).toBe(
      false
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the newest 1000 log lines of a node and counts the dropped ones", async () => {
    await liveState.appendLogs(
      context.launch._id,
      "echo_node",
      Array.from({ length: 1002 }, (_, i) => ({ message: `old ${i}` }))
    );
    doubles.execute.mockResolvedValue({
      result: { __type: "next" },
      logs: [{ ts: 1767323045000, message: "hello", level: "info" }],
    });

    await context.run();

    const { lines, dropped } = await liveState.logs(
      context.launch._id,
      "echo_node"
    );
    expect(lines).toHaveLength(1000);
    expect(lines.at(-1)).toMatchObject({ message: "hello" });
    expect(dropped).toBe(3);
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
    spyOnLiveState("beat").mockImplementation(async () => {
      if (++heartbeats === 2) {
        return new Promise<void>((resolve) => {
          finishHeartbeat = resolve;
        });
      }
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
          logs: [{ ts: 1767323045000, level: "error", message: "bad input" }],
        },
        ExecutionError
      )
    );

    await expect(context.run()).rejects.toBeInstanceOf(DataError);

    expect(
      (await liveState.logs(context.launch._id, "echo_node")).lines
    ).toEqual([
      { level: "error", message: "bad input", attempt: 0, ts: 1767323045000 },
    ]);
    expect(await liveState.isProcessing(context.launch._id, "echo_node")).toBe(
      false
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    {
      phase: "execute",
      fail: (failure: Error) => doubles.execute.mockRejectedValue(failure),
      releasesLock: true,
    },
    {
      phase: "start",
      fail: (failure: Error) =>
        spyOnLiveState("nodeStarted").mockRejectedValue(failure),
      releasesLock: false,
    },
    {
      phase: "stop",
      fail: (failure: Error) =>
        spyOnLiveState("nodeStopped").mockRejectedValue(failure),
      releasesLock: true,
    },
    {
      phase: "heartbeat",
      fail: (failure: Error) =>
        spyOnLiveState("beat").mockRejectedValue(failure),
      releasesLock: false,
    },
  ])(
    "cleans up timers after a failure in $phase",
    async ({ phase, fail, releasesLock }) => {
      const failure = new Error(`${phase} failed`);
      const stopped = spyOnLiveState("nodeStopped");
      fail(failure);

      await expect(context.run()).rejects.toBe(failure);

      expect(vi.getTimerCount()).toBe(0);
      expect(stopped.mock.calls.length > 0).toBe(releasesLock);
    }
  );

  it("rejects malformed execution results after releasing the lock", async () => {
    doubles.execute.mockResolvedValue({
      result: { unexpected: true },
      logs: [],
    });

    await expect(context.run()).rejects.toThrow("Wrong handler results");

    expect(await liveState.isProcessing(context.launch._id, "echo_node")).toBe(
      false
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
