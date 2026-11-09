import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";
import "reflect-metadata";

// mirrors backend/models/project-stats.ts
export const STATS_PERIODS = [7, 30, 90] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

// node runs are kept for a week only
export const NODE_STATS_DAYS = 7;

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

  // 0..1, null without runs
  @Expose()
  @Type(() => Number)
  successRate: number | null = null;

  @Expose()
  @Type(() => Number)
  avgDurationMs: number | null = null;

  @Expose()
  @Type(() => Date)
  lastRunAt: Date | null = null;
}

export class ProjectRunsSummary extends RunsSummary {
  @Expose()
  @Type(() => String)
  project: string;
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

  get runs(): number {
    return this.succeeded + this.failed + this.interrupted;
  }
}

export class NodeRunsStats {
  @Expose()
  @Type(() => String)
  node: string;

  @Expose()
  @Type(() => Number)
  runs: number = 0;

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

  @Expose()
  @Type(() => NodeRunsStats)
  nodes: NodeRunsStats[] = [];
}
