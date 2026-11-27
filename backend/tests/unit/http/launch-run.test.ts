import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { httpUserFixture, userToken } from "../../fixtures/http";
import { beforeEach, describe, expect, it } from "vitest";

const LAUNCH_ID = "launch-test";
const PATH = `/api/launches/${LAUNCH_ID}/run`;

/** A launch_runs row as ClickHouse returns it in JSONEachRow. */
function launchRunRow() {
  return {
    launchedAt: "2026-11-27 10:00:00.000",
    startedAt: "2026-11-27 10:00:02.000",
    finishedAt: "2026-11-27 10:01:46.500",
    launch: LAUNCH_ID,
    project: "project-http",
    pipeline: "pipeline",
    launchedBy: "launcher-user",
    scope: "",
    status: "error",
    queuedMs: 2000,
    durationMs: 104500,
  };
}

let context: Awaited<ReturnType<typeof createHttpApp>>;

beforeEach(async () => {
  const scenario = httpScenario();
  scenario.users.set("launcher-user", httpUserFixture("launcher-user"));
  httpDoubles.launches.findOne.mockResolvedValue({
    _id: LAUNCH_ID,
    launchedBy: { _id: "launcher-user" },
    project: { _id: "project-http", createdBy: { _id: "owner-user" } },
  });
  context = await createHttpApp([() => import("api/launches")]);
});

describe("GET /api/launches/:launch/run", () => {
  it("returns the recorded run of a finished launch, cached for good", async () => {
    httpDoubles.clickhouse.query.mockResolvedValue({
      json: async () => [launchRunRow()],
    });

    const response = await context.request
      .get(PATH)
      .set({ "user-token": userToken("launcher-user") });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      launch: LAUNCH_ID,
      status: "error",
      finishedAt: "2026-11-27 10:01:46.500",
      durationMs: 104500,
    });
    expect(response.headers["cache-control"]).toBe(
      "private, max-age=31536000, immutable"
    );
    expect(httpDoubles.clickhouse.query).toHaveBeenCalledWith(
      expect.objectContaining({ query_params: { launch: LAUNCH_ID } })
    );
  });

  it("answers no content without caching while no run is recorded", async () => {
    httpDoubles.clickhouse.query.mockResolvedValue({ json: async () => [] });

    const response = await context.request
      .get(PATH)
      .set({ "user-token": userToken("launcher-user") });

    expect(response.status).toBe(204);
    expect(response.headers["cache-control"]).toBeUndefined();
  });
});
