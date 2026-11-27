import { Expose, Transform, Type } from "class-transformer";
import "reflect-metadata";
import { dateTransformer } from "../transformers/date";

export type LaunchRunStatus = "done" | "error" | "interrupted";

/** The recorded outcome of a finished launch (`GET /api/launches/:id/run`). */
export class LaunchRun {
  @Expose()
  @Type(() => String)
  launch!: string;

  @Expose()
  @Type(() => String)
  status!: LaunchRunStatus;

  @Expose()
  @Transform(dateTransformer("yyyy-MM-dd HH:mm:ss.SSS"))
  finishedAt!: Date;

  /** From the launch's start (`startedAt`) to its end, as the live clock counts. */
  @Expose()
  @Type(() => Number)
  durationMs!: number;
}
