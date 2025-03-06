import { Expose, Type } from "class-transformer";
import merge from "lodash/merge";
import "reflect-metadata";

export class RunLaunchJob {
  @Expose()
  @Type(() => String)
  launch: string;

  constructor(defs: Partial<RunLaunchJob> = {}) {
    merge(this, defs);
  }
}
