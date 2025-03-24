import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";
import "reflect-metadata";

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
