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
  // Match by ID or email and apply inclusive projections, as login and auth rely on both.
  httpDoubles.users.findOne.mockImplementation(async (query, options) => {
    const conditions = query.$or ?? [query];
    const user = [...users.values()].find((candidate) =>
      conditions.some(
        ({ _id, email }) =>
          (_id !== undefined && candidate._id === _id) ||
          (email !== undefined && candidate.email === email)
      )
    );
    return user ? applyProjection({ ...user }, options?.projection) : null;
  });
  httpDoubles.projects.findOne.mockImplementation(async () =>
    structuredClone(project)
  );
  httpDoubles.launches.findOne.mockResolvedValue(null);
  httpDoubles.redis.get.mockImplementation(
    async (key) => redisResponses.get(key) ?? null
  );

  return { users, project, redisResponses };
}

function applyProjection(
  document: object,
  projection?: Record<string, number>
) {
  if (!projection) return document;
  return Object.fromEntries(
    Object.entries(document).filter(
      ([key]) =>
        projection[key] === 1 || (key === "_id" && projection._id !== 0)
    )
  );
}
