import { Expose, Matches, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";

export class RunScope {
  @Matches(/^[a-z0-9\\-_]{5,40}$/)
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
