import { Expose, Type } from "class-transformer";
import merge from "lodash/merge";
import "reflect-metadata";
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
