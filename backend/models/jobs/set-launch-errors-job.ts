import { Expose, Type } from "core-kit/packages/transform";
import merge from "lodash/merge";

export class SetLaunchErrorsJob {
  @Expose()
  @Type(() => String)
  launch: string;

  constructor(defs: Partial<SetLaunchErrorsJob> = {}) {
    merge(this, defs);
  }
}
