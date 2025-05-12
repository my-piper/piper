import { Expose, Type } from "core-kit/packages/transform";
import merge from "lodash/merge";

export class ProcessNodeJob {
  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Type(() => String)
  node: string;

  constructor(defs: Partial<ProcessNodeJob> = {}) {
    merge(this, defs);
  }
}
