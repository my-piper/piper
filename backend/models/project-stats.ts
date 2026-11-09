import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";

export const STATS_PERIODS = [7, 30, 90] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

// launch outcomes over a period, shared by the project page and the projects list
export class RunsSummary {
  @Expose()
  @Type(() => Number)
  runs: number = 0;

  @Expose()
  @Type(() => Number)
  succeeded: number = 0;

  @Expose()
  @Type(() => Number)
  failed: number = 0;

  @Expose()
  @Type(() => Number)
  interrupted: number = 0;

  // share of succeeded runs, 0..1; null without runs
  @Expose()
  @Type(() => Number)
  successRate: number | null = null;

  @Expose()
  @Type(() => Number)
  avgDurationMs: number | null = null;

  @Expose()
  @Type(() => Date)
  lastRunAt: Date | null = null;

  constructor(defs: Partial<RunsSummary> = {}) {
    assign(this, defs);
  }
}

export class ProjectRunsSummary extends RunsSummary {
  @Expose()
  @Type(() => String)
  project: string;

  constructor(defs: Partial<ProjectRunsSummary> = {}) {
    super();
    assign(this, defs);
  }
}

export class DailyRuns {
  // yyyy-MM-dd
  @Expose()
  @Type(() => String)
  day: string;

  @Expose()
  @Type(() => Number)
  succeeded: number = 0;

  @Expose()
  @Type(() => Number)
  failed: number = 0;

  @Expose()
  @Type(() => Number)
  interrupted: number = 0;

  @Expose()
  @Type(() => Number)
  avgDurationMs: number | null = null;

  constructor(defs: Partial<DailyRuns> = {}) {
    assign(this, defs);
  }
}

export class NodeRunsStats {
  @Expose()
  @Type(() => String)
  node: string;

  @Expose()
  @Type(() => Number)
  runs: number = 0;

  // runs ended by an error, a timeout or the memory limit
  @Expose()
  @Type(() => Number)
  failed: number = 0;

  @Expose()
  @Type(() => Number)
  avgDurationMs: number = 0;

  @Expose()
  @Type(() => Number)
  p95DurationMs: number = 0;

  @Expose()
  @Type(() => Number)
  avgWaitMs: number = 0;

  constructor(defs: Partial<NodeRunsStats> = {}) {
    assign(this, defs);
  }
}

export class ProjectStats extends RunsSummary {
  @Expose()
  @Type(() => Number)
  days: StatsPeriod;

  @Expose()
  @Type(() => Number)
  p50DurationMs: number | null = null;

  @Expose()
  @Type(() => Number)
  p95DurationMs: number | null = null;

  @Expose()
  @Type(() => Number)
  maxDurationMs: number | null = null;

  @Expose()
  @Type(() => Number)
  avgQueuedMs: number | null = null;

  @Expose()
  @Type(() => DailyRuns)
  daily: DailyRuns[] = [];

  // node runs are kept for a week only, so they never span more than 7 days
  @Expose()
  @Type(() => NodeRunsStats)
  nodes: NodeRunsStats[] = [];

  constructor(defs: Partial<ProjectStats> = {}) {
    super();
    assign(this, defs);
  }
}
