import { Expose, Type } from "class-transformer";
import merge from "lodash/merge";
import "reflect-metadata";

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
