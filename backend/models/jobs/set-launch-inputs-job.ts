import { Expose, Type } from "class-transformer";
import merge from "lodash/merge";
import "reflect-metadata";

export class SetLaunchInputsJob {
  @Expose()
  @Type(() => String)
  launch: string;

  constructor(defs: Partial<SetLaunchInputsJob> = {}) {
    merge(this, defs);
  }
}
