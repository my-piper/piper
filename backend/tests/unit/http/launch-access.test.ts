import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { httpUserFixture, userToken } from "../../fixtures/http";
import { launchFixture } from "../../fixtures/launch";
import { LAUNCH } from "consts/redis";
import { toPlain } from "core-kit/packages/transform";
import { beforeEach, describe, expect, it } from "vitest";

const LAUNCH_ID = "launch-test";

// Every route that reads or changes one launch, so adding a route here is
// enough to put it under the same access rule (checkLaunchVisible).
const ROUTES = [
  { method: "get", path: `/api/launches/${LAUNCH_ID}` },
  { method: "delete", path: `/api/launches/${LAUNCH_ID}` },
  { method: "get", path: `/api/launches/${LAUNCH_ID}/state` },
  { method: "get", path: `/api/launches/${LAUNCH_ID}/data` },
  { method: "get", path: `/api/launches/${LAUNCH_ID}/logs` },
  { method: "get", path: `/api/launches/${LAUNCH_ID}/heartbeat` },
  { method: "post", path: `/api/launches/${LAUNCH_ID}/interrupt` },
  { method: "get", path: `/api/launches/${LAUNCH_ID}/metrics/finished` },
  { method: "get", path: `/api/launches/${LAUNCH_ID}/metrics/outputs` },
  { method: "get", path: `/api/launches/${LAUNCH_ID}/echo_node/inputs` },
  { method: "get", path: `/api/launches/${LAUNCH_ID}/echo_node/outputs` },
  { method: "get", path: `/api/launches/${LAUNCH_ID}/echo_node/progress` },
  { method: "get", path: `/api/launches/${LAUNCH_ID}/echo_node/status` },
  { method: "get", path: `/api/launches/${LAUNCH_ID}/nodes/echo_node/state` },
  { method: "get", path: `/api/launches/${LAUNCH_ID}/nodes/echo_node/jobs` },
] as const;

let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  const scenario = httpScenario();
  scenario.users.set("launcher-user", httpUserFixture("launcher-user"));
  httpDoubles.launches.findOne.mockImplementation(async ({ _id }) =>
    _id === LAUNCH_ID
      ? {
          _id,
          launchedBy: { _id: "launcher-user" },
          project: { _id: "project-http", createdBy: { _id: "owner-user" } },
        }
      : null
  );
  httpDoubles.launches.deleteOne.mockResolvedValue({ deletedCount: 1 });
  httpDoubles.clickhouse.query.mockResolvedValue({ json: async () => [] });
  scenario.redisResponses.set(
    LAUNCH(LAUNCH_ID),
    JSON.stringify(toPlain(launchFixture()))
  );
  httpDoubles.redis.EXISTS.mockResolvedValue(1);
  context = await createHttpApp([() => import("api/launches")]);
});

function send(
  { method, path }: (typeof ROUTES)[number],
  headers: Record<string, string> = {}
) {
  return context.request[method](path).set(headers);
}

function untouched() {
  expect(httpDoubles.launches.deleteOne).not.toHaveBeenCalled();
  expect(httpDoubles.redis.get).not.toHaveBeenCalled();
  expect(httpDoubles.redis.setEx).not.toHaveBeenCalled();
  expect(httpDoubles.clickhouse.query).not.toHaveBeenCalled();
}

describe("launch access", () => {
  it.each(ROUTES)("rejects an anonymous $method $path", async (route) => {
    const response = await send(route);

    expect(response.status).toBe(400);
    untouched();
  });

  it.each(ROUTES)("hides $method $path from another user", async (route) => {
    const response = await send(route, {
      "user-token": userToken("other-user"),
    });

    expect(response.status).toBe(404);
    untouched();
  });

  it.each(ROUTES)(
    "answers $method $path for a missing launch with 404",
    async ({ method, path }) => {
      const response = await send(
        { method, path: path.replace(LAUNCH_ID, "missing") } as never,
        { "user-token": userToken("launcher-user") }
      );

      expect(response.status).toBe(404);
      untouched();
    }
  );

  describe.each([
    { kind: "the launching user", user: "launcher-user" },
    { kind: "the project owner", user: "owner-user" },
    { kind: "an admin", user: "admin-user" },
  ])("for $kind", ({ user }) => {
    it.each(ROUTES)("allows $method $path", async (route) => {
      const response = await send(route, { "user-token": userToken(user) });

      expect(response.status).toBeLessThan(300);
    });
  });
});
