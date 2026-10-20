import {
  mongo,
  queues,
  connection,
  redis,
  nodeQueue,
  launchQueue,
} from "./runtime";
import { pipelineLaunch } from "./fixture";
import { Job, Queue, QueueEvents, Worker } from "bullmq";
import {
  LAUNCH,
  LAUNCH_HEARTBEAT,
  NODE_OUTPUTS,
  NODE_PROCESSED_LOCK,
  NODE_PROCESSING_LOCK,
  NODE_STATUS,
  PIPELINE_OUTPUT,
} from "consts/redis";
import { toPlain } from "core-kit/packages/transform";
import { Launch } from "models/launch";
import { randomUUID } from "node:crypto";
import { execute } from "packages/deno/execute";
import { get, run } from "packages/launches/launching";
import { NodeJobResult } from "types/node";
import { RunLaunchJobResult } from "types/launch";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("packages/deno/execute", () => ({ execute: vi.fn() }));

const expectedOutput = { enabled: false, count: 0, text: "" };
const executeMock = vi.mocked(execute);

function nextResult(value: unknown) {
  return { result: { __type: "next", outputs: { result: value } }, logs: [] };
}

beforeEach(() => {
  executeMock.mockReset();
  executeMock.mockImplementation(async (script, _fn, payload) => {
    const { inputs } = payload as { inputs: Record<string, unknown> };
    return nextResult(script.includes("echo") ? inputs : inputs.value);
  });
});

async function finished(job: Job, queue = nodeQueue) {
  await vi.waitFor(async () => expect(await job.getState()).toBe("completed"), {
    timeout: 10_000,
    interval: 20,
  });
  return queue.getJob(job.id);
}

async function completedPipeline(id: string) {
  await vi.waitFor(
    async () => {
      expect(
        JSON.parse(await redis.get(PIPELINE_OUTPUT(id, "result")))
      ).toEqual(expectedOutput);
      expect(await redis.exists(NODE_PROCESSED_LOCK(id, "sink_node"))).toBe(1);
    },
    { timeout: 10_000, interval: 20 }
  );
}

describe("launch storage and real node workers", () => {
  it("isolates the application Redis database from BullMQ's connection", async () => {
    const key = `isolation-${randomUUID()}`;

    await redis.set(key, "application");
    await connection.set(key, "queues");

    expect(await redis.get(key)).toBe("application");
    expect(await connection.get(key)).toBe("queues");
  });

  it("persists and retrieves a launch without losing nested models or falsy inputs", async () => {
    const source = pipelineLaunch();
    source.launchRequest.inclusive = { nodes: [] };

    const launch = await run(source);
    const persisted = await mongo.launches.findOne({ _id: launch._id });
    const loaded = await get(launch._id);

    expect(persisted).toMatchObject({
      _id: launch._id,
      launchRequest: { inputs: expectedOutput },
    });
    expect(persisted).not.toHaveProperty("pipeline");
    expect(loaded).toBeInstanceOf(Launch);
    expect(loaded.launchedAt).toEqual(launch.launchedAt);
    expect(loaded.pipeline.nodes).toBeInstanceOf(Map);
    expect(toPlain(loaded)).toEqual(toPlain(launch));
    expect(await redis.ttl(LAUNCH(launch._id))).toBeGreaterThan(0);
    await expect(get(`missing-${randomUUID()}`)).rejects.toThrow("not found");
  });

  it("processes two nodes, propagates outputs, and releases processing locks", async () => {
    const source = pipelineLaunch();

    const launch = await run(source);
    await completedPipeline(launch._id);

    expect(executeMock).toHaveBeenCalledTimes(2);
    for (const node of ["echo_node", "sink_node"]) {
      const outputs = JSON.parse(
        await redis.get(NODE_OUTPUTS(launch._id, node))
      );
      expect(JSON.parse(outputs.result)).toEqual(expectedOutput);
      expect(await redis.exists(NODE_PROCESSING_LOCK(launch._id, node))).toBe(
        0
      );
      expect(
        JSON.parse(await redis.get(NODE_STATUS(launch._id, node)))
      ).toMatchObject({
        state: "done",
      });
    }
  });

  it("ignores a second delivery after the node has completed", async () => {
    const launch = await run(pipelineLaunch());
    await completedPipeline(launch._id);

    const duplicate = await queues.nodes.process.rapid.plan({
      launch: launch._id,
      node: "echo_node",
    });
    const result = await finished(duplicate);

    expect(result.returnvalue).toBe(
      NodeJobResult.NODE_HAS_BEEN_PROCESSED_ALREADY
    );
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it("rejects delivery while a real Redis processing lock is held", async () => {
    const source = pipelineLaunch();
    source.launchRequest.inclusive = { nodes: [] };
    const launch = await run(source);
    const key = NODE_PROCESSING_LOCK(launch._id, "echo_node");
    await redis.setEx(key, 30, "another-worker");

    const duplicate = await queues.nodes.process.rapid.plan({
      launch: launch._id,
      node: "echo_node",
    });
    const result = await finished(duplicate);

    expect(result.returnvalue).toBe(
      NodeJobResult.NODE_IS_PROCESSING_NOW_ALREADY
    );
    expect(await redis.get(key)).toBe("another-worker");
    expect(await redis.ttl(key)).toBeGreaterThan(0);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("retries a failed execution and releases its Redis lock before retrying", async () => {
    const source = pipelineLaunch();
    source.launchRequest.inclusive = { nodes: [] };
    const launch = await run(source);
    executeMock.mockRejectedValueOnce(new Error("Temporary Deno failure"));

    const job = await queues.nodes.process.rapid.plan(
      { launch: launch._id, node: "echo_node" },
      { attempts: 2, backoff: { type: "fixed", delay: 100 } }
    );
    const result = await finished(job);
    await completedPipeline(launch._id);

    expect(result.attemptsMade).toBe(2);
    expect(executeMock).toHaveBeenCalledTimes(3);
    expect(
      await redis.exists(NODE_PROCESSING_LOCK(launch._id, "echo_node"))
    ).toBe(0);
  });

  it("resumes RepeatNode as a delayed job without spending a failed attempt", async () => {
    const source = pipelineLaunch();
    source.launchRequest.inclusive = { nodes: [] };
    const launch = await run(source);
    executeMock.mockResolvedValueOnce({
      result: { __type: "repeat", delay: 60_000, state: { cursor: 1 } },
      logs: [],
    });

    const job = await queues.nodes.process.rapid.plan({
      launch: launch._id,
      node: "echo_node",
    });
    await vi.waitFor(async () => expect(await job.getState()).toBe("delayed"));

    expect((await nodeQueue.getJob(job.id)).attemptsMade).toBe(0);
    expect(
      await redis.exists(NODE_PROCESSING_LOCK(launch._id, "echo_node"))
    ).toBe(0);

    await job.promote();
    const result = await finished(job);
    await completedPipeline(launch._id);

    expect(result.attemptsMade).toBe(1);
    expect(executeMock.mock.calls[1][2]).toMatchObject({
      state: { cursor: 1 },
    });
  });
});

describe("scope concurrency", () => {
  it("runs one pipeline at a time within a scope", async () => {
    const source = pipelineLaunch();
    source.scope.activated = true;
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    executeMock.mockImplementationOnce(async () => {
      await gate;
      return nextResult(expectedOutput);
    });
    try {
      const first = await run(source);
      await vi.waitFor(() => expect(executeMock).toHaveBeenCalledOnce());

      const second = await run(source);
      let delayed: Job;
      await vi.waitFor(async () => {
        delayed = (await launchQueue.getDelayed()).find(
          (job) => job.data.launch === second._id
        );
        expect(delayed).toBeDefined();
      });

      expect(executeMock).toHaveBeenCalledOnce();
      expect(
        await redis.exists(NODE_PROCESSING_LOCK(first._id, "echo_node"))
      ).toBe(1);

      release();
      await completedPipeline(first._id);
      await delayed.promote();
      await completedPipeline(second._id);

      expect(executeMock).toHaveBeenCalledTimes(4);
      expect(await redis.lRange(source.scope.id, 0, -1)).toEqual([]);
    } finally {
      release();
    }
  });

  it("delays a launch behind a live launch and resumes when the slot is released", async () => {
    const source = pipelineLaunch();
    source.scope.activated = true;
    const blocker = `live-${randomUUID()}`;
    await redis.setEx(LAUNCH_HEARTBEAT(blocker), 60, "alive");
    await redis.rPush(source.scope.id, blocker);

    const launch = await run(source);
    let delayed: Job;
    await vi.waitFor(async () => {
      [delayed] = await launchQueue.getDelayed();
      expect(delayed?.data.launch).toBe(launch._id);
    });

    expect(executeMock).not.toHaveBeenCalled();
    expect(delayed.attemptsMade).toBe(0);
    expect(delayed.failedReason).toBeFalsy();

    await redis.lRem(source.scope.id, 0, blocker);
    await delayed.promote();
    const result = await finished(delayed, launchQueue);
    await completedPipeline(launch._id);

    expect(result.returnvalue).toBe(RunLaunchJobResult.RUN_LAUNCH);
    expect(result.attemptsMade).toBe(1);
    expect(await redis.lRange(source.scope.id, 0, -1)).toEqual([]);
  });

  it("reclaims a stale launch's slot using the remaining queue position", async () => {
    const source = pipelineLaunch();
    source.scope.activated = true;
    await redis.rPush(source.scope.id, `dead-${randomUUID()}`);

    const launch = await run(source);
    await vi.waitFor(
      async () => {
        const jobs = await launchQueue.getJobs([
          "active",
          "waiting",
          "delayed",
          "completed",
        ]);
        const job = jobs.find((job) => job.data.launch === launch._id);
        expect(await job?.getState()).toBe("completed");
      },
      { timeout: 2000, interval: 20 }
    );
    await completedPipeline(launch._id);

    expect(await redis.lRange(source.scope.id, 0, -1)).toEqual([]);
    expect(executeMock).toHaveBeenCalledTimes(2);
  });
});

describe("BullMQ resource lifecycle", () => {
  it("deduplicates an explicit job id and cleans resources after a processing failure", async () => {
    const name = `cleanup-${randomUUID()}`;
    const queue = new Queue(name, { connection });
    const events = new QueueEvents(name, { connection });
    const processJob = vi.fn(async () => {
      throw new Error("Expected worker failure");
    });
    const worker = new Worker(name, processJob, { connection, autorun: false });
    try {
      await events.waitUntilReady();
      const first = await queue.add(
        "test",
        { value: 1 },
        { jobId: "duplicate" }
      );
      const second = await queue.add(
        "test",
        { value: 2 },
        { jobId: "duplicate" }
      );

      const result = first.waitUntilFinished(events, 5000);
      void worker.run();
      await expect(result).rejects.toThrow("Expected worker failure");

      expect(second.id).toBe(first.id);
      expect(processJob).toHaveBeenCalledOnce();
      expect((await queue.getJob(first.id)).data).toEqual({ value: 1 });
      expect(await queue.getFailedCount()).toBe(1);
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate();
      await queue.close();
    }
    expect(worker.isRunning()).toBe(false);
    expect(await connection.keys(`bull:${name}:*`)).toEqual([]);
  });
});
