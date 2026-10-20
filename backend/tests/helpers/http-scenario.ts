import { vi } from "vitest";
import {
  HTTP_TEST_SECRET,
  HTTP_TEST_TIME,
  httpProjectFixture,
  httpUserFixture,
} from "../fixtures/http";
import { httpDoubles, resetHttpDoubles } from "./http-boundaries";

export function httpScenario() {
  resetHttpDoubles();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(HTTP_TEST_TIME);
  vi.stubEnv("JWT_SECRET", HTTP_TEST_SECRET);
  vi.stubEnv("BILLING_ACTIVE", "no");
  vi.stubEnv("TRACK_BALANCE", "no");
  vi.stubEnv("UNIT_COST", "1");

  const users = new Map([
    ["owner-user", httpUserFixture()],
    ["other-user", httpUserFixture("other-user")],
    ["admin-user", httpUserFixture("admin-user", ["admin"])],
    ["engineer-user", httpUserFixture("engineer-user", ["engineer"])],
  ]);
  const project = httpProjectFixture();
  const redisResponses = new Map<string, string>();
  httpDoubles.users.findOne.mockImplementation(
    async ({ _id }) => users.get(_id) ?? null
  );
  httpDoubles.projects.findOne.mockImplementation(async () =>
    structuredClone(project)
  );
  httpDoubles.launches.findOne.mockResolvedValue(null);
  httpDoubles.redis.get.mockImplementation(
    async (key) => redisResponses.get(key) ?? null
  );

  return { users, project, redisResponses };
}
