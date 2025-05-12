import { Expose, Type } from "core-kit/packages/transform";
import merge from "lodash/merge";
import { RunScope } from "./run-scope";

export class RunLaunchJob {
  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Type(() => RunScope)
  scope: RunScope;

  constructor(defs: Partial<RunLaunchJob> = {}) {
    merge(this, defs);
  }
}
