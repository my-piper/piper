import clickhouse from "core-kit/packages/clickhouse";
import { NodeExecutionResult } from "models/node-execution-record";
import { getNodeRunsStats } from "packages/projects/stats";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const MIGRATION = join(
  __dirname,
  "../../../migrations/clickhouse/000014_node_executions.up.sql"
);

// the table from the migration, without its Kafka consumer and view
function nodeExecutionsTable(): string {
  const [table] = readFileSync(MIGRATION, "utf8").split(";");
  return table;
}

type Execution = {
  node: string;
  result: NodeExecutionResult;
  durationMs: number;
  waitMs?: number;
  // days before now
  ago?: number;
  project?: string;
};

async function insert(executions: Execution[]) {
  const now = Date.now();
  await clickhouse.insert({
    table: "node_executions",
    format: "JSONEachRow",
    values: executions.map(
      ({ ago, project, waitMs, durationMs, ...execution }) => {
        const startedAt = now - (ago ?? 0) * 86_400_000 - durationMs - 1000;
        return {
          ...execution,
          startedAt: new Date(startedAt).toISOString(),
          finishedAt: new Date(startedAt + durationMs).toISOString(),
          launch: "launch",
          project: project ?? "project-a",
          pipeline: "pipeline",
          launchedBy: "user",
          execution: "deferred",
          waitMs: waitMs ?? 0,
          durationMs,
          activeMs: 0,
          invocations: 1,
          attempts: 1,
        };
      }
    ),
    clickhouse_settings: { date_time_input_format: "best_effort" },
  });
}

describe("node runs stats", () => {
  beforeEach(async () => {
    await clickhouse.command({ query: "DROP TABLE IF EXISTS node_executions" });
    await clickhouse.command({ query: nodeExecutionsTable() });
  });

  afterAll(async () => {
    await clickhouse.command({ query: "DROP TABLE IF EXISTS node_executions" });
    await clickhouse.close();
  });

  it("aggregates executions per node, slowest first", async () => {
    await insert([
      { node: "fast", result: "done", durationMs: 100, waitMs: 10 },
      { node: "slow", result: "done", durationMs: 60_000, waitMs: 100 },
      { node: "slow", result: "error", durationMs: 40_000, waitMs: 300 },
    ]);

    const stats = await getNodeRunsStats("project-a", 30);

    expect(stats).toEqual([
      expect.objectContaining({
        node: "slow",
        runs: 2,
        failed: 1,
        avgDurationMs: 50_000,
        avgWaitMs: 200,
      }),
      expect.objectContaining({
        node: "fast",
        runs: 1,
        failed: 0,
        avgDurationMs: 100,
        p95DurationMs: 100,
        avgWaitMs: 10,
      }),
    ]);
  });

  it("counts interrupted executions as runs without their duration", async () => {
    await insert([
      { node: "poll", result: "done", durationMs: 1000, waitMs: 10 },
      { node: "poll", result: "interrupted", durationMs: 9000, waitMs: 90 },
    ]);

    const stats = await getNodeRunsStats("project-a", 30);

    expect(stats).toEqual([
      expect.objectContaining({
        runs: 2,
        failed: 0,
        avgDurationMs: 1000,
        p95DurationMs: 1000,
        avgWaitMs: 10,
      }),
    ]);
  });

  it("keeps to the period and the project", async () => {
    await insert([
      { node: "recent", result: "done", durationMs: 10, ago: 5 },
      { node: "older", result: "done", durationMs: 10, ago: 20 },
      { node: "other", result: "done", durationMs: 10, project: "project-b" },
    ]);

    const week = await getNodeRunsStats("project-a", 7);
    const month = await getNodeRunsStats("project-a", 30);

    expect(week.map(({ node }) => node)).toEqual(["recent"]);
    expect(month.map(({ node }) => node).sort()).toEqual(["older", "recent"]);
  });
});
