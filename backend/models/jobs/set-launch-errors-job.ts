import { Expose, Type } from "class-transformer";
import merge from "lodash/merge";
import "reflect-metadata";

export class SetLaunchErrorsJob {
  @Expose()
  @Type(() => String)
  launch: string;

  constructor(defs: Partial<SetLaunchErrorsJob> = {}) {
    merge(this, defs);
  }
}
