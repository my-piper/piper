import mongo, { mongo as mongoClient } from "app/mongo";
import { queues } from "app/queues";
import { Queue } from "bullmq";
import { JobsQueue } from "core-kit/packages/queue";
import connection from "core-kit/packages/queue/redis";
import redis from "core-kit/packages/redis";
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from "vitest";

export { mongo, mongoClient, queues, connection, redis };
export const nodeQueue = new Queue("process_rapid_nodes", { connection });
export const launchQueue = new Queue("run_launch", { connection });

function registeredQueues(registry: object): { close(): Promise<void> }[] {
  return Object.values(registry).flatMap((value) =>
    value instanceof JobsQueue ? [value] : registeredQueues(value)
  );
}

beforeAll(async () => {
  await mongoClient.connect();
  await redis.ping();
  await connection.ping();
  await nodeQueue.waitUntilReady();
  await launchQueue.waitUntilReady();
  await import("jobs/process-node/process-rapid-nodes");
  await import("jobs/run-launch");
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await vi.waitFor(
    async () => {
      for (const queue of [nodeQueue, launchQueue]) {
        const counts = await queue.getJobCounts("active", "waiting");
        expect(counts).toMatchObject({ active: 0, waiting: 0 });
      }
    },
    { timeout: 10_000, interval: 20 }
  );
  // BullMQ reports worker infrastructure errors here rather than failing a job.
  expect(console.error).not.toHaveBeenCalled();
});

afterAll(async () => {
  const closed = await Promise.allSettled([
    ...registeredQueues(queues).map((queue) => queue.close()),
    nodeQueue.close(),
    launchQueue.close(),
  ]);
  let disconnected: PromiseSettledResult<unknown>[];
  try {
    const database = mongoClient.db(process.env.MONGO_DB);
    await database.dropDatabase();
    await redis.flushDb();
    await connection.flushdb();
    expect(await database.listCollections().toArray()).toEqual([]);
    expect(await redis.dbSize()).toBe(0);
    expect(await connection.dbsize()).toBe(0);
  } finally {
    disconnected = await Promise.allSettled([
      mongoClient.close(),
      redis.quit(),
      connection.quit(),
    ]);
  }
  const failures = [...closed, ...disconnected].filter(
    (result) => result.status === "rejected"
  );
  if (failures.length) {
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Integration resource cleanup failed"
    );
  }
  expect(redis.isOpen).toBe(false);
  // ioredis resolves quit() before it emits "end" and updates its status.
  await vi.waitFor(() => expect(connection.status).toBe("end"));
});
