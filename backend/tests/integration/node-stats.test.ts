import clickhouse from "core-kit/packages/clickhouse";
import { NodeRunResult } from "models/node-run";
import { getNodeRunsStats } from "packages/projects/stats";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const MIGRATION = join(
  __dirname,
  "../../../migrations/clickhouse/000007_node_runs.up.sql"
);

// the table from the migration, without its Kafka consumer and view
function nodeRunsTable(): string {
  const [table] = readFileSync(MIGRATION, "utf8").split(";");
  return table;
}

type Invocation = {
  launch: string;
  node: string;
  // seconds before now
  ago: number;
  result: NodeRunResult;
  waitMs: number;
  durationMs: number;
  attempt?: number;
  project?: string;
};

async function insert(invocations: Invocation[]) {
  const now = Date.now();
  await clickhouse.insert({
    table: "node_runs",
    format: "JSONEachRow",
    values: invocations.map(({ ago, project, attempt, ...invocation }) => ({
      ...invocation,
      startedAt: new Date(now - ago * 1000).toISOString(),
      project: project ?? "project-a",
      pipeline: "pipeline",
      launchedBy: "user",
      execution: "deferred",
      attempt: attempt ?? 0,
    })),
    clickhouse_settings: { date_time_input_format: "best_effort" },
  });
}

describe("node runs stats", () => {
  beforeEach(async () => {
    await clickhouse.command({ query: "DROP TABLE IF EXISTS node_runs" });
    await clickhouse.command({ query: nodeRunsTable() });
  });

  afterAll(async () => {
    await clickhouse.command({ query: "DROP TABLE IF EXISTS node_runs" });
    await clickhouse.close();
  });

  it("measures a polling node from its first invocation to its outcome", async () => {
    await insert([
      ...[0, 1, 2, 3, 4].map((poll) => ({
        launch: "launch-1",
        node: "edit-image",
        ago: 120 - poll * 12,
        result: "repeat" as const,
        waitMs: poll === 0 ? 100 : 5,
        durationMs: 60,
      })),
      {
        launch: "launch-1",
        node: "edit-image",
        ago: 60,
        result: "done",
        waitMs: 5,
        durationMs: 62,
      },
    ]);

    const stats = await getNodeRunsStats("project-a", 7);

    expect(stats).toEqual([
      expect.objectContaining({
        node: "edit-image",
        runs: 1,
        failed: 0,
        avgDurationMs: 60_062,
        p95DurationMs: 60_062,
        avgWaitMs: 100,
      }),
    ]);
  });

  it("counts each loop iteration of a node as an execution", async () => {
    await insert([
      {
        launch: "launch-1",
        node: "loop",
        ago: 30,
        result: "repeat",
        waitMs: 10,
        durationMs: 100,
      },
      {
        launch: "launch-1",
        node: "loop",
        ago: 29,
        result: "done",
        waitMs: 1,
        durationMs: 0,
      },
      {
        launch: "launch-1",
        node: "loop",
        ago: 20,
        result: "done",
        waitMs: 30,
        durationMs: 1000,
      },
    ]);

    const [stats] = await getNodeRunsStats("project-a", 7);

    expect(stats).toMatchObject({
      runs: 2,
      avgDurationMs: 1000,
      avgWaitMs: 20,
    });
  });

  it("counts a failed attempt and its retry as two executions", async () => {
    await insert([
      {
        launch: "launch-1",
        node: "flaky",
        ago: 30,
        result: "error",
        waitMs: 20,
        durationMs: 200,
      },
      {
        launch: "launch-1",
        node: "flaky",
        ago: 28,
        result: "done",
        waitMs: 40,
        durationMs: 300,
        attempt: 1,
      },
    ]);

    const [stats] = await getNodeRunsStats("project-a", 7);

    expect(stats).toMatchObject({ runs: 2, failed: 1, avgDurationMs: 250 });
  });

  it("leaves out executions without an outcome and other projects", async () => {
    await insert([
      {
        launch: "launch-1",
        node: "polling",
        ago: 60,
        result: "repeat",
        waitMs: 10,
        durationMs: 50,
      },
      {
        launch: "launch-2",
        node: "other",
        ago: 60,
        result: "done",
        waitMs: 0,
        durationMs: 50,
        project: "project-b",
      },
    ]);

    const stats = await getNodeRunsStats("project-a", 7);

    expect(stats).toEqual([]);
  });

  it("separates the same node in different launches", async () => {
    await insert([
      {
        launch: "launch-1",
        node: "step",
        ago: 60,
        result: "repeat",
        waitMs: 0,
        durationMs: 10,
      },
      {
        launch: "launch-2",
        node: "step",
        ago: 50,
        result: "done",
        waitMs: 0,
        durationMs: 10,
      },
    ]);

    const stats = await getNodeRunsStats("project-a", 7);

    expect(stats).toEqual([
      expect.objectContaining({ node: "step", runs: 1, avgDurationMs: 10 }),
    ]);
  });
});
