import {
  dateTransformer,
  Expose,
  Transform,
  Type,
} from "core-kit/packages/transform";
import merge from "lodash/merge";
import { RUN_DATE_FORMAT } from "./node-run";

export type NodeExecutionResult =
  | "done"
  | "error"
  | "timeout"
  | "memory"
  | "interrupted";

// One execution of a node: its invocations (repeats and retries) up to the
// final outcome. node_runs keeps the invocations themselves.
export class NodeExecutionRecord {
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
  node: string;

  @Expose()
  @Type(() => String)
  launchedBy: string;

  @Expose()
  @Type(() => String)
  execution: string;

  @Expose()
  @Type(() => String)
  result: NodeExecutionResult;

  // before the first invocation
  @Expose()
  @Type(() => Number)
  waitMs: number;

  // wall-clock, from the first invocation's start to the outcome
  @Expose()
  @Type(() => Number)
  durationMs: number;

  // the invocations' own time, without the delays between them
  @Expose()
  @Type(() => Number)
  activeMs: number;

  @Expose()
  @Type(() => Number)
  invocations: number;

  @Expose()
  @Type(() => Number)
  attempts: number;

  constructor(defs: Partial<NodeExecutionRecord> = {}) {
    merge(this, defs);
  }
}
