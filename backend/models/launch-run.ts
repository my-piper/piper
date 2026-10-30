import {
  dateTransformer,
  Expose,
  Transform,
  Type,
} from "core-kit/packages/transform";
import merge from "lodash/merge";
import { RUN_DATE_FORMAT } from "models/node-run";

export type LaunchRunStatus = "done" | "error" | "interrupted";

export class LaunchRun {
  @Expose()
  @Transform(dateTransformer(RUN_DATE_FORMAT))
  launchedAt: Date;

  @Expose()
  @Transform(dateTransformer(RUN_DATE_FORMAT))
  startedAt: Date;

  @Expose()
  @Transform(dateTransformer(RUN_DATE_FORMAT))
  finishedAt: Date;

  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Type(() => String)
  project: string;

  @Expose()
  @Type(() => String)
  pipeline: string;

  @Expose()
  @Type(() => String)
  launchedBy: string;

  @Expose()
  @Type(() => String)
  scope: string;

  @Expose()
  @Type(() => String)
  status: LaunchRunStatus;

  @Expose()
  @Type(() => Number)
  queuedMs: number;

  @Expose()
  @Type(() => Number)
  durationMs: number;

  constructor(defs: Partial<LaunchRun> = {}) {
    merge(this, defs);
  }
}
