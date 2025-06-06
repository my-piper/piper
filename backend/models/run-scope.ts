import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";

export class RunScope {
  @Expose()
  @Type(() => String)
  id: string;

  @Expose()
  @Type(() => Boolean)
  activated: boolean;

  @Expose()
  @Type(() => Number)
  maxConcurrent: number;

  constructor(defs: Partial<RunScope> = {}) {
    assign(this, defs);
  }
}
