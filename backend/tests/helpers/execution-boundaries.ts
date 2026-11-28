import { vi } from "vitest";
import { liveStore } from "./live-state";

const doubles = vi.hoisted(() => ({
  // Redis outside the Launch live state: the Environment and Deploys
  redis: {
    get: vi.fn(),
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
    run: vi.fn(),
    interrupted: vi.fn(),
  },
  metrics: {
    outputs: vi.fn(),
    finished: vi.fn(),
    errors: vi.fn(),
    nodeRuns: vi.fn(),
    launchRuns: vi.fn(),
    nodeExecutions: vi.fn(),
  },
  execute: vi.fn(),
  notify: vi.fn(),
  insertOne: vi.fn(),
  distinct: vi.fn(),
  artefact: vi.fn(),
  bucket: vi.fn(),
  captureException: vi.fn(),
}));

export { doubles };
export { liveState, liveStore } from "./live-state";

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
      interrupted: { record: { plan: doubles.plans.interrupted } },
    },
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
        executions: { send: doubles.metrics.nodeExecutions },
      },
    },
  },
}));
vi.mock("core-kit/packages/io", () => ({ notify: doubles.notify }));
vi.mock("core-kit/packages/sentry", () => ({
  default: { captureException: doubles.captureException },
}));
vi.mock("app/mongo", () => ({
  default: {
    launches: { insertOne: doubles.insertOne, distinct: doubles.distinct },
  },
}));
vi.mock("app/storage", () => ({
  artefact: doubles.artefact,
  bucket: doubles.bucket,
}));
vi.mock("packages/deno/execute", () => ({ execute: doubles.execute }));

export function resetExecutionDoubles() {
  liveStore.clear();
  for (const mock of [
    ...Object.values(doubles.redis),
    ...Object.values(doubles.plans),
    ...Object.values(doubles.metrics),
    doubles.execute,
    doubles.notify,
    doubles.insertOne,
    doubles.distinct,
    doubles.artefact,
    doubles.bucket,
    doubles.captureException,
  ]) {
    mock.mockReset();
  }

  doubles.redis.get.mockResolvedValue(null);
  doubles.distinct.mockResolvedValue([]);
  doubles.bucket.mockReturnValue(null);
  doubles.execute.mockResolvedValue({
    result: {
      __type: "next",
      outputs: { result: { enabled: false, count: 0 } },
    },
    logs: [],
  });
}
