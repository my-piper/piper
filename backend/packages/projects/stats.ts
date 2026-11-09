import clickhouse from "core-kit/packages/clickhouse";
import {
  DailyRuns,
  NodeRunsStats,
  ProjectRunsSummary,
  ProjectStats,
  RunsSummary,
  StatsPeriod,
} from "models/project-stats";

// ClickHouse quotes 64-bit integers in JSON, and NaN comes from empty quantiles
type Numeric = number | string | null;

type SummaryRow = {
  total: Numeric;
  succeeded: Numeric;
  failed: Numeric;
  interrupted: Numeric;
  totalDurationMs: Numeric;
  totalQueuedMs: Numeric;
  longestMs: Numeric;
  quantiles: Numeric[];
  lastRunAt: Numeric;
};

type ProjectSummaryRow = SummaryRow & { project: string };

type DailyRow = {
  date: string;
  total: Numeric;
  succeeded: Numeric;
  failed: Numeric;
  interrupted: Numeric;
  totalDurationMs: Numeric;
};

type NodeRow = {
  node: string;
  total: Numeric;
  failed: Numeric;
  avgDurationMs: Numeric;
  p95DurationMs: Numeric;
  avgWaitMs: Numeric;
};

// aliases differ from the column names: ClickHouse resolves an alias before a column
const SUMMARY_COLUMNS = `
  sum(runs) AS total,
  sumIf(runs, status = 'done') AS succeeded,
  sumIf(runs, status = 'error') AS failed,
  sumIf(runs, status = 'interrupted') AS interrupted,
  sum(durationMsSum) AS totalDurationMs,
  sum(queuedMsSum) AS totalQueuedMs,
  max(maxDurationMs) AS longestMs,
  quantilesTDigestMerge(0.5, 0.95)(durationQuantiles) AS quantiles,
  toUnixTimestamp64Milli(max(lastLaunchedAt)) AS lastRunAt`;

// "last N days" includes today
const PERIOD_FILTER = `day > today() - {days: UInt16}`;

function toNumber(value: Numeric): number | null {
  const number = Number(value);
  return value === null || !Number.isFinite(number) ? null : number;
}

function average(sum: Numeric, count: number): number | null {
  return count > 0 ? Math.round(toNumber(sum) / count) : null;
}

function round(value: Numeric): number | null {
  const number = toNumber(value);
  return number === null ? null : Math.round(number);
}

function toSummary(row: SummaryRow): RunsSummary {
  const runs = toNumber(row.total) ?? 0;
  const succeeded = toNumber(row.succeeded) ?? 0;
  return new RunsSummary({
    runs,
    succeeded,
    failed: toNumber(row.failed) ?? 0,
    interrupted: toNumber(row.interrupted) ?? 0,
    successRate: runs > 0 ? succeeded / runs : null,
    avgDurationMs: average(row.totalDurationMs, runs),
    lastRunAt: runs > 0 ? new Date(toNumber(row.lastRunAt)) : null,
  });
}

async function select<T>(
  query: string,
  query_params: Record<string, unknown>
): Promise<T[]> {
  return await (
    await clickhouse.query({ query, format: "JSONEachRow", query_params })
  ).json<T>();
}

export async function getProjectsRunsSummary(
  projects: string[],
  days: StatsPeriod
): Promise<ProjectRunsSummary[]> {
  if (projects.length === 0) {
    return [];
  }

  const rows = await select<ProjectSummaryRow>(
    `SELECT project, ${SUMMARY_COLUMNS}
    FROM launch_runs_daily
    WHERE project IN {projects: Array(String)} AND ${PERIOD_FILTER}
    GROUP BY project`,
    { projects, days }
  );
  return rows.map(
    (row) => new ProjectRunsSummary({ project: row.project, ...toSummary(row) })
  );
}

export async function getProjectStats(
  project: string,
  days: StatsPeriod
): Promise<ProjectStats> {
  const [[summary], daily, nodes] = await Promise.all([
    select<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS}
      FROM launch_runs_daily
      WHERE project = {project: String} AND ${PERIOD_FILTER}`,
      { project, days }
    ),
    select<DailyRow>(
      `SELECT toString(day) AS date,
        sum(runs) AS total,
        sumIf(runs, status = 'done') AS succeeded,
        sumIf(runs, status = 'error') AS failed,
        sumIf(runs, status = 'interrupted') AS interrupted,
        sum(durationMsSum) AS totalDurationMs
      FROM launch_runs_daily
      WHERE project = {project: String} AND ${PERIOD_FILTER}
      GROUP BY day
      ORDER BY day`,
      { project, days }
    ),
    select<NodeRow>(
      `SELECT node,
        count() AS total,
        countIf(result IN ('error', 'timeout', 'memory')) AS failed,
        avg(durationMs) AS avgDurationMs,
        quantileTDigest(0.95)(durationMs) AS p95DurationMs,
        avg(waitMs) AS avgWaitMs
      FROM node_runs
      WHERE project = {project: String}
        AND startedAt > now() - toIntervalDay({days: UInt16})
      GROUP BY node
      ORDER BY avgDurationMs DESC
      LIMIT 10`,
      { project, days }
    ),
  ]);

  const runs = toNumber(summary?.total) ?? 0;
  const [p50, p95] = summary?.quantiles ?? [];
  return new ProjectStats({
    days,
    ...(summary ? toSummary(summary) : new RunsSummary()),
    p50DurationMs: runs > 0 ? round(p50) : null,
    p95DurationMs: runs > 0 ? round(p95) : null,
    maxDurationMs: runs > 0 ? toNumber(summary.longestMs) : null,
    avgQueuedMs: average(summary?.totalQueuedMs, runs),
    daily: daily.map(
      (row) =>
        new DailyRuns({
          day: row.date,
          succeeded: toNumber(row.succeeded) ?? 0,
          failed: toNumber(row.failed) ?? 0,
          interrupted: toNumber(row.interrupted) ?? 0,
          avgDurationMs: average(row.totalDurationMs, toNumber(row.total) ?? 0),
        })
    ),
    nodes: nodes.map(
      (row) =>
        new NodeRunsStats({
          node: row.node,
          runs: toNumber(row.total) ?? 0,
          failed: toNumber(row.failed) ?? 0,
          avgDurationMs: round(row.avgDurationMs) ?? 0,
          p95DurationMs: round(row.p95DurationMs) ?? 0,
          avgWaitMs: round(row.avgWaitMs) ?? 0,
        })
    ),
  });
}
