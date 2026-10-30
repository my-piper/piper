import { vi } from "vitest";

const doubles = vi.hoisted(() => ({
  redis: {
    get: vi.fn(),
    GET: vi.fn(),
    EXISTS: vi.fn(),
    setEx: vi.fn(),
    set: vi.fn(),
    sAdd: vi.fn(),
    sIsMember: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
    rPush: vi.fn(),
    lPush: vi.fn(),
    lRem: vi.fn(),
    lRange: vi.fn(),
  },
  plans: {
    rapid: vi.fn(),
    regular: vi.fn(),
    deferred: vi.fn(),
    protracted: vi.fn(),
    artefacts: vi.fn(),
    output: vi.fn(),
    inputs: vi.fn(),
    errors: vi.fn(),
    usage: vi.fn(),
    run: vi.fn(),
  },
  metrics: {
    outputs: vi.fn(),
    finished: vi.fn(),
    errors: vi.fn(),
    nodeRuns: vi.fn(),
    launchRuns: vi.fn(),
  },
  execute: vi.fn(),
  notify: vi.fn(),
  insertOne: vi.fn(),
  artefact: vi.fn(),
  bucket: vi.fn(),
  captureException: vi.fn(),
}));

export { doubles };

vi.mock("core-kit/packages/redis/redis", () => ({ default: doubles.redis }));
vi.mock("core-kit/packages/redis", async () => ({
  ...(await import("core-kit/packages/redis/utils")),
  default: doubles.redis,
}));
vi.mock("core-kit/packages/queue", async () => ({
  DelayedError: (await import("bullmq")).DelayedError,
}));
vi.mock("app/queues", () => ({
  queues: {
    nodes: {
      process: {
        rapid: { plan: doubles.plans.rapid },
        regular: { plan: doubles.plans.regular },
        deferred: { plan: doubles.plans.deferred },
        protracted: { plan: doubles.plans.protracted },
      },
    },
    launches: {
      artefacts: { save: { plan: doubles.plans.artefacts } },
      outputs: { set: { plan: doubles.plans.output } },
      inputs: { set: { plan: doubles.plans.inputs } },
      errors: { set: { plan: doubles.plans.errors } },
      run: { plan: doubles.plans.run },
    },
    pipelines: { usage: { record: { plan: doubles.plans.usage } } },
  },
}));
vi.mock("app/streams", () => ({
  streams: {
    pipeline: {
      metrics: {
        outputs: { send: doubles.metrics.outputs },
        finished: { send: doubles.metrics.finished },
      },
      errors: { send: doubles.metrics.errors },
      runs: {
        nodes: { send: doubles.metrics.nodeRuns },
        launches: { send: doubles.metrics.launchRuns },
      },
    },
  },
}));
vi.mock("core-kit/packages/io", () => ({ notify: doubles.notify }));
vi.mock("core-kit/packages/sentry", () => ({
  default: { captureException: doubles.captureException },
}));
vi.mock("app/mongo", () => ({
  default: { launches: { insertOne: doubles.insertOne } },
}));
vi.mock("app/storage", () => ({
  artefact: doubles.artefact,
  bucket: doubles.bucket,
}));
vi.mock("packages/deno/execute", () => ({ execute: doubles.execute }));

export function resetExecutionDoubles() {
  for (const mock of [
    ...Object.values(doubles.redis),
    ...Object.values(doubles.plans),
    ...Object.values(doubles.metrics),
    doubles.execute,
    doubles.notify,
    doubles.insertOne,
    doubles.artefact,
    doubles.bucket,
    doubles.captureException,
  ]) {
    mock.mockReset();
  }

  doubles.redis.get.mockResolvedValue(null);
  doubles.redis.GET.mockResolvedValue(null);
  doubles.redis.EXISTS.mockResolvedValue(0);
  doubles.redis.set.mockResolvedValue("OK");
  doubles.redis.sIsMember.mockResolvedValue(true);
  doubles.redis.lRange.mockResolvedValue([]);
  doubles.bucket.mockReturnValue(null);
  doubles.execute.mockResolvedValue({
    result: {
      __type: "next",
      outputs: { result: { enabled: false, count: 0 } },
    },
    logs: [],
  });
}
