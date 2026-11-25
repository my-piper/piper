import { httpDoubles } from "../../helpers/http-boundaries";
import { createHttpApp } from "../../helpers/http-app";
import { httpScenario } from "../../helpers/http-scenario";
import { userToken } from "../../fixtures/http";
import { beforeEach, describe, expect, it } from "vitest";

let context: Awaited<ReturnType<typeof createHttpApp>>;

const rows = (...rowsByQuery: object[][]) => {
  for (const result of rowsByQuery) {
    httpDoubles.clickhouse.query.mockResolvedValueOnce({
      json: async () => result,
    });
  }
};

beforeEach(async () => {
  httpScenario();
  context = await createHttpApp([
    () => import("api/projects/stats/list-projects-stats"),
    () => import("api/projects/stats/get-project-stats"),
  ]);
});

describe("project stats", () => {
  it("converts ClickHouse rows of a project with runs", async () => {
    rows(
      [
        {
          total: "10",
          succeeded: "8",
          failed: "1",
          interrupted: "1",
          totalDurationMs: "5000",
          totalQueuedMs: "250",
          longestMs: "1200",
          quantiles: [510.4, "950.6"],
          lastRunAt: "1735689600000",
        },
      ],
      [
        {
          date: "2025-01-01",
          total: "4",
          succeeded: "3",
          failed: "1",
          interrupted: "0",
          totalDurationMs: "2001",
        },
        {
          date: "2025-01-02",
          total: "0",
          succeeded: "0",
          failed: "0",
          interrupted: "0",
          totalDurationMs: "0",
        },
      ],
      [
        {
          node: "node-a",
          total: "7",
          failed: "2",
          avgDurationMs: 120.6,
          p95DurationMs: "300.2",
          avgWaitMs: null,
        },
      ]
    );

    const response = await context.request
      .get("/api/projects/project-http/stats")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      days: 30,
      runs: 10,
      succeeded: 8,
      failed: 1,
      interrupted: 1,
      successRate: 0.8,
      avgDurationMs: 500,
      lastRunAt: "2025-01-01T00:00:00.000Z",
      p50DurationMs: 510,
      p95DurationMs: 951,
      maxDurationMs: 1200,
      avgQueuedMs: 25,
      daily: [
        {
          day: "2025-01-01",
          succeeded: 3,
          failed: 1,
          interrupted: 0,
          avgDurationMs: 500,
        },
        {
          day: "2025-01-02",
          succeeded: 0,
          failed: 0,
          interrupted: 0,
          avgDurationMs: null,
        },
      ],
      nodes: [
        {
          node: "node-a",
          runs: 7,
          failed: 2,
          avgDurationMs: 121,
          p95DurationMs: 300,
          avgWaitMs: 0,
        },
      ],
    });
  });

  it("returns nulls for a project without runs", async () => {
    rows(
      [
        {
          total: "0",
          succeeded: "0",
          failed: "0",
          interrupted: "0",
          totalDurationMs: "0",
          totalQueuedMs: "0",
          longestMs: "0",
          quantiles: [NaN, null],
          lastRunAt: null,
        },
      ],
      [],
      []
    );

    const response = await context.request
      .get("/api/projects/project-http/stats")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      days: 30,
      runs: 0,
      succeeded: 0,
      failed: 0,
      interrupted: 0,
      successRate: null,
      avgDurationMs: null,
      lastRunAt: null,
      p50DurationMs: null,
      p95DurationMs: null,
      maxDurationMs: null,
      avgQueuedMs: null,
      daily: [],
      nodes: [],
    });
  });

  it("returns an empty summary when ClickHouse has no summary row", async () => {
    rows([], [], []);

    const response = await context.request
      .get("/api/projects/project-http/stats")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      days: 30,
      runs: 0,
      successRate: null,
      lastRunAt: null,
      daily: [],
      nodes: [],
    });
  });

  it.each([
    { query: {}, days: 30 },
    { query: { days: "7" }, days: 7 },
    { query: { days: "30" }, days: 30 },
    { query: { days: "90" }, days: 90 },
  ])("queries $days days for $query", async ({ query, days }) => {
    rows([], [], []);

    const response = await context.request
      .get("/api/projects/project-http/stats")
      .query(query)
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body.days).toBe(days);
    expect(httpDoubles.clickhouse.query).toHaveBeenCalledTimes(3);
    expect(
      httpDoubles.clickhouse.query.mock.calls.map(([call]) => ({
        format: call.format,
        params: call.query_params,
      }))
    ).toEqual(
      Array(3).fill({
        format: "JSONEachRow",
        params: { project: "project-http", days },
      })
    );
  });

  it.each(["14", "0", "abc", "-7"])(
    "rejects days=%s without querying ClickHouse",
    async (days) => {
      const response = await context.request
        .get("/api/projects/project-http/stats")
        .query({ days })
        .set("user-token", userToken());

      expect(response.status).toBe(400);
      expect(httpDoubles.clickhouse.query).not.toHaveBeenCalled();
    }
  );

  it("looks the project up by id with a minimal projection", async () => {
    rows([], [], []);

    await context.request
      .get("/api/projects/project-http/stats")
      .set("user-token", userToken());

    expect(httpDoubles.projects.findOne).toHaveBeenCalledExactlyOnceWith(
      { _id: "project-http" },
      { projection: { _id: 1, createdBy: 1 } }
    );
  });

  it.each(["owner-user", "admin-user"])(
    "lets %s read stats of a project",
    async (user) => {
      rows([], [], []);

      const response = await context.request
        .get("/api/projects/project-http/stats")
        .set("user-token", userToken(user));

      expect(response.status).toBe(200);
      expect(httpDoubles.clickhouse.query).toHaveBeenCalledTimes(3);
    }
  );

  it.each(["other-user", "engineer-user"])(
    "hides stats of a project from %s as not found",
    async (user) => {
      const response = await context.request
        .get("/api/projects/project-http/stats")
        .set("user-token", userToken(user));

      expect(response.status).toBe(404);
      expect(httpDoubles.clickhouse.query).not.toHaveBeenCalled();
    }
  );

  it("returns 404 for a missing project", async () => {
    httpDoubles.projects.findOne.mockResolvedValue(null);

    const response = await context.request
      .get("/api/projects/missing/stats")
      .set("user-token", userToken());

    expect(response.status).toBe(404);
    expect(httpDoubles.clickhouse.query).not.toHaveBeenCalled();
  });

  it("rejects anonymous requests before accessing storage", async () => {
    const response = await context.request.get(
      "/api/projects/project-http/stats"
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("You aren't logged");
    expect(httpDoubles.projects.findOne).not.toHaveBeenCalled();
    expect(httpDoubles.clickhouse.query).not.toHaveBeenCalled();
  });
});

describe("projects runs summary", () => {
  const summaryRow = {
    project: "project-a",
    total: "4",
    succeeded: "3",
    failed: "1",
    interrupted: "0",
    totalDurationMs: "1001",
    totalQueuedMs: "10",
    longestMs: "500",
    quantiles: [1, 2],
    lastRunAt: "1735689600000",
  };

  it("converts rows and keeps only the user's own projects", async () => {
    httpDoubles.projectsCursor.toArray.mockResolvedValue([
      { _id: "project-a" },
      { _id: "project-b" },
    ]);
    rows([
      summaryRow,
      {
        ...summaryRow,
        project: "project-b",
        total: "0",
        succeeded: "0",
        failed: "0",
        totalDurationMs: "0",
        lastRunAt: "0",
      },
    ]);

    const response = await context.request
      .get("/api/projects/stats")
      .query({ projects: ["project-a", "project-b", "project-c"] })
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        project: "project-a",
        runs: 4,
        succeeded: 3,
        failed: 1,
        interrupted: 0,
        successRate: 0.75,
        avgDurationMs: 250,
        lastRunAt: "2025-01-01T00:00:00.000Z",
      },
      {
        project: "project-b",
        runs: 0,
        succeeded: 0,
        failed: 0,
        interrupted: 0,
        successRate: null,
        avgDurationMs: null,
        lastRunAt: null,
      },
    ]);
    expect(httpDoubles.projects.find).toHaveBeenCalledExactlyOnceWith(
      {
        _id: { $in: ["project-a", "project-b", "project-c"] },
        "createdBy._id": "owner-user",
      },
      { projection: { _id: 1 } }
    );
  });

  it("passes only visible ids and the default period to ClickHouse", async () => {
    httpDoubles.projectsCursor.toArray.mockResolvedValue([
      { _id: "project-a" },
    ]);
    rows([]);

    await context.request
      .get("/api/projects/stats")
      .query({ projects: ["project-a", "project-secret"] })
      .set("user-token", userToken());

    expect(httpDoubles.clickhouse.query).toHaveBeenCalledOnce();
    expect(httpDoubles.clickhouse.query.mock.calls[0][0]).toMatchObject({
      format: "JSONEachRow",
      query_params: { projects: ["project-a"], days: 30 },
    });
  });

  it("accepts a single project id and a custom period", async () => {
    httpDoubles.projectsCursor.toArray.mockResolvedValue([
      { _id: "project-a" },
    ]);
    rows([]);

    await context.request
      .get("/api/projects/stats")
      .query({ projects: "project-a", days: "90" })
      .set("user-token", userToken());

    expect(httpDoubles.clickhouse.query.mock.calls[0][0].query_params).toEqual({
      projects: ["project-a"],
      days: 90,
    });
  });

  it("returns an empty list when no requested project is visible", async () => {
    httpDoubles.projectsCursor.toArray.mockResolvedValue([]);

    const response = await context.request
      .get("/api/projects/stats")
      .query({ projects: ["project-secret"] })
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(httpDoubles.clickhouse.query).not.toHaveBeenCalled();
  });

  it("short-circuits an empty projects list without querying", async () => {
    const response = await context.request
      .get("/api/projects/stats")
      .set("user-token", userToken());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(httpDoubles.projects.find).not.toHaveBeenCalled();
    expect(httpDoubles.clickhouse.query).not.toHaveBeenCalled();
  });

  it("is routed before the project id route", async () => {
    const response = await context.request
      .get("/api/projects/stats")
      .set("user-token", userToken());

    expect(response.body).toEqual([]);
    expect(httpDoubles.projects.findOne).not.toHaveBeenCalled();
  });

  it.each([
    { name: "an unsupported period", query: { projects: "a", days: "14" } },
    {
      name: "more than 100 projects",
      query: { projects: Array.from({ length: 101 }, (_, i) => `p${i}`) },
    },
  ])("rejects $name before querying", async ({ query }) => {
    const response = await context.request
      .get("/api/projects/stats")
      .query(query)
      .set("user-token", userToken());

    expect(response.status).toBe(400);
    expect(httpDoubles.projects.find).not.toHaveBeenCalled();
    expect(httpDoubles.clickhouse.query).not.toHaveBeenCalled();
  });

  it("rejects anonymous requests", async () => {
    const response = await context.request
      .get("/api/projects/stats")
      .query({ projects: "project-a" });

    expect(response.status).toBe(400);
    expect(httpDoubles.projects.find).not.toHaveBeenCalled();
    expect(httpDoubles.clickhouse.query).not.toHaveBeenCalled();
  });
});
