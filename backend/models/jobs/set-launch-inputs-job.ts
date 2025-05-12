import { Expose, Type } from "core-kit/packages/transform";
import merge from "lodash/merge";

export class SetLaunchInputsJob {
  @Expose()
  @Type(() => String)
  launch: string;

  constructor(defs: Partial<SetLaunchInputsJob> = {}) {
    merge(this, defs);
  }
}
