import {
  dateTransformer,
  Expose,
  Transform,
  Type,
} from "core-kit/packages/transform";
import merge from "lodash/merge";

export const RUN_DATE_FORMAT = "yyyy-MM-dd HH:mm:ss.SSS";

export type NodeRunResult = "done" | "repeat" | "error" | "timeout" | "memory";

export class NodeRun {
  @Expose()
  @Transform(dateTransformer(RUN_DATE_FORMAT))
  startedAt: Date;

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
  node: string;

  @Expose()
  @Type(() => String)
  launchedBy: string;

  @Expose()
  @Type(() => String)
  execution: string;

  @Expose()
  @Type(() => Number)
  attempt: number;

  @Expose()
  @Type(() => String)
  result: NodeRunResult;

  @Expose()
  @Type(() => Number)
  waitMs: number;

  @Expose()
  @Type(() => Number)
  durationMs: number;

  constructor(defs: Partial<NodeRun> = {}) {
    merge(this, defs);
  }
}
