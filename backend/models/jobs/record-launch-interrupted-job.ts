import { Expose, Type } from "core-kit/packages/transform";
import merge from "lodash/merge";

export class RecordLaunchInterruptedJob {
  @Expose()
  @Type(() => String)
  launch: string;

  constructor(defs: Partial<RecordLaunchInterruptedJob> = {}) {
    merge(this, defs);
  }
}
