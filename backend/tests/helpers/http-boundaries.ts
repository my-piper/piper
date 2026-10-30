import { vi } from "vitest";

const httpDoubles = vi.hoisted(() => ({
  users: {
    findOne: vi.fn(),
    find: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
  },
  usersCursor: { sort: vi.fn(), limit: vi.fn(), toArray: vi.fn() },
  projects: {
    findOne: vi.fn(),
    find: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
  },
  projectsCursor: { sort: vi.fn(), limit: vi.fn(), toArray: vi.fn() },
  launches: { findOne: vi.fn(), insertOne: vi.fn() },
  redis: {
    get: vi.fn(),
    GET: vi.fn(),
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
    updateBalance: vi.fn(),
  },
  clickhouse: { query: vi.fn(), insert: vi.fn() },
  sendEmail: vi.fn(),
  axios: vi.fn(),
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
    users: { updateBalance: { plan: httpDoubles.plans.updateBalance } },
  },
}));
vi.mock("core-kit/packages/clickhouse", () => ({
  default: httpDoubles.clickhouse,
}));
vi.mock("core-kit/packages/mailer", () => ({
  sendEmail: httpDoubles.sendEmail,
}));
// Outbound HTTP (email verification, captcha, remote assets) is rejected unless a test stubs it.
vi.mock("axios", () => ({
  default: Object.assign(httpDoubles.axios, {
    create: () => httpDoubles.axios,
  }),
}));
vi.mock("packages/deno/execute", () => ({ execute: httpDoubles.execute }));
vi.mock("utils/string", () => ({ sid: () => "http-generated-id" }));
vi.mock("ulid", () => ({ ulid: () => "http-generated-cursor" }));

export function resetHttpDoubles() {
  for (const mock of [
    ...Object.values(httpDoubles.users),
    ...Object.values(httpDoubles.usersCursor),
    ...Object.values(httpDoubles.projects),
    ...Object.values(httpDoubles.projectsCursor),
    ...Object.values(httpDoubles.launches),
    ...Object.values(httpDoubles.redis),
    ...Object.values(httpDoubles.plans),
    ...Object.values(httpDoubles.clickhouse),
    httpDoubles.sendEmail,
    httpDoubles.axios,
    httpDoubles.execute,
    httpDoubles.captureException,
  ])
    mock.mockReset();

  httpDoubles.users.find.mockReturnValue(httpDoubles.usersCursor);
  httpDoubles.usersCursor.sort.mockReturnValue(httpDoubles.usersCursor);
  httpDoubles.usersCursor.limit.mockReturnValue(httpDoubles.usersCursor);
  httpDoubles.usersCursor.toArray.mockResolvedValue([]);
  httpDoubles.projects.find.mockReturnValue(httpDoubles.projectsCursor);
  httpDoubles.projectsCursor.sort.mockReturnValue(httpDoubles.projectsCursor);
  httpDoubles.projectsCursor.limit.mockReturnValue(httpDoubles.projectsCursor);
  httpDoubles.projectsCursor.toArray.mockResolvedValue([]);
  httpDoubles.redis.get.mockResolvedValue(null);
  httpDoubles.redis.GET.mockResolvedValue(null);
  httpDoubles.redis.EXISTS.mockResolvedValue(0);
  httpDoubles.redis.scriptLoad.mockResolvedValue("http-test-script");
  httpDoubles.redis.evalSha.mockResolvedValue("1");
  httpDoubles.axios.mockRejectedValue(
    new Error("Unexpected external HTTP request in an HTTP contract test")
  );
  httpDoubles.execute.mockResolvedValue({ result: 1, logs: [] });
}
