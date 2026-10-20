import { vi } from "vitest";

const httpDoubles = vi.hoisted(() => ({
  users: { findOne: vi.fn() },
  projects: {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
  },
  launches: { findOne: vi.fn(), insertOne: vi.fn() },
  redis: {
    get: vi.fn(),
    setEx: vi.fn(),
    set: vi.fn(),
    EXISTS: vi.fn(),
    scriptLoad: vi.fn(),
    evalSha: vi.fn(),
  },
  plans: {
    rapid: vi.fn(),
    regular: vi.fn(),
    deferred: vi.fn(),
    protracted: vi.fn(),
    inputs: vi.fn(),
  },
  execute: vi.fn(),
  captureException: vi.fn(),
}));

export { httpDoubles };

vi.mock("app/mongo", () => ({
  default: {
    users: httpDoubles.users,
    projects: httpDoubles.projects,
    launches: httpDoubles.launches,
  },
}));
vi.mock("core-kit/packages/redis/redis", () => ({
  default: httpDoubles.redis,
}));
vi.mock("core-kit/packages/redis", async () => ({
  ...(await import("core-kit/packages/redis/utils")),
  default: httpDoubles.redis,
}));
vi.mock("core-kit/packages/sentry", () => ({
  default: { captureException: httpDoubles.captureException },
}));
vi.mock("app/storage", () => ({}));
vi.mock("app/queues", () => ({
  queues: {
    nodes: {
      process: {
        rapid: { plan: httpDoubles.plans.rapid },
        regular: { plan: httpDoubles.plans.regular },
        deferred: { plan: httpDoubles.plans.deferred },
        protracted: { plan: httpDoubles.plans.protracted },
      },
    },
    launches: { inputs: { set: { plan: httpDoubles.plans.inputs } } },
  },
}));
vi.mock("packages/deno/execute", () => ({ execute: httpDoubles.execute }));
vi.mock("utils/string", () => ({ sid: () => "http-generated-id" }));
vi.mock("ulid", () => ({ ulid: () => "http-generated-cursor" }));

export function resetHttpDoubles() {
  for (const mock of [
    ...Object.values(httpDoubles.users),
    ...Object.values(httpDoubles.projects),
    ...Object.values(httpDoubles.launches),
    ...Object.values(httpDoubles.redis),
    ...Object.values(httpDoubles.plans),
    httpDoubles.execute,
    httpDoubles.captureException,
  ])
    mock.mockReset();

  httpDoubles.redis.get.mockResolvedValue(null);
  httpDoubles.redis.EXISTS.mockResolvedValue(0);
  httpDoubles.redis.scriptLoad.mockResolvedValue("http-test-script");
  httpDoubles.redis.evalSha.mockResolvedValue("1");
  httpDoubles.execute.mockResolvedValue({ result: 1, logs: [] });
}
