import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";

export class RunScope {
  @Expose()
  @Type(() => String)
  id: string;

  @Expose()
  @Type(() => Number)
  maxConcurrent: number;

  constructor(defs: Partial<RunScope> = {}) {
    assign(this, defs);
  }
}
