import { vi } from "vitest";

type Handler = (payload: object) => Promise<unknown>;

const jobDoubles = vi.hoisted(() => ({
  // Real queue declarations register here; payloads go through their real job models.
  handlers: new Map<string, Handler>(),
  plans: new Map<string, ReturnType<typeof vi.fn>>(),
  redis: { get: vi.fn(), setEx: vi.fn(), lRange: vi.fn() },
  mongo: {
    users: { updateOne: vi.fn() },
    launches: { updateOne: vi.fn() },
    launchArtefacts: { insertOne: vi.fn() },
  },
  clickhouse: { query: vi.fn() },
  usage: vi.fn(),
  notify: vi.fn(),
  captureException: vi.fn(),
  download: vi.fn(),
  storage: { bucket: vi.fn(), output: vi.fn(), artefact: vi.fn() },
}));

export { jobDoubles };

vi.mock("core-kit/packages/queue", async () => {
  const { DelayedError } = await import("bullmq");
  const { toInstance } = await import("core-kit/packages/transform");

  class JobsQueue<T> {
    plan = vi.fn();

    constructor(
      private id: string,
      private model: new () => T
    ) {
      jobDoubles.plans.set(id, this.plan);
    }

    process(handler: (payload: T) => Promise<unknown>) {
      jobDoubles.handlers.set(this.id, (payload) =>
        handler(toInstance(payload, this.model))
      );
    }
  }

  return { DelayedError, JobsQueue };
});
// The real declarations only construct JobsQueue instances, which are faked above.
vi.mock("app/queues", async () => vi.importActual("app/queues"));
vi.mock("core-kit/packages/redis/redis", () => ({ default: jobDoubles.redis }));
vi.mock("core-kit/packages/redis", async () => ({
  ...(await import("core-kit/packages/redis/utils")),
  default: jobDoubles.redis,
}));
vi.mock("app/mongo", () => ({ default: jobDoubles.mongo }));
vi.mock("app/streams", () => ({
  streams: { pipeline: { usage: { send: jobDoubles.usage } } },
}));
vi.mock("core-kit/packages/clickhouse", () => ({
  default: jobDoubles.clickhouse,
}));
vi.mock("core-kit/packages/io", () => ({ notify: jobDoubles.notify }));
vi.mock("core-kit/packages/sentry", () => ({
  default: { captureException: jobDoubles.captureException },
}));
vi.mock("app/storage", () => jobDoubles.storage);
vi.mock("utils/web", () => ({ download: jobDoubles.download }));
vi.mock("packages/deno/execute", () => ({ execute: vi.fn() }));
vi.mock("utils/string", () => ({ sid: () => "fixed-artefact" }));
vi.mock("ulid", () => ({ ulid: () => "fixed-cursor" }));

export function resetJobDoubles() {
  for (const mock of [
    ...jobDoubles.plans.values(),
    ...Object.values(jobDoubles.redis),
    ...Object.values(jobDoubles.mongo).flatMap((collection) =>
      Object.values(collection)
    ),
    jobDoubles.clickhouse.query,
    jobDoubles.usage,
    jobDoubles.notify,
    jobDoubles.captureException,
    jobDoubles.download,
    ...Object.values(jobDoubles.storage),
  ]) {
    mock.mockReset();
  }

  jobDoubles.redis.get.mockResolvedValue(null);
  jobDoubles.redis.lRange.mockResolvedValue([]);
  jobDoubles.storage.bucket.mockReturnValue(null);
}

export function runJob(queue: string, payload: object) {
  const handler = jobDoubles.handlers.get(queue);
  if (!handler) throw new Error(`No handler registered for ${queue}`);
  return handler(payload);
}
