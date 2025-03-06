import { Expose, Type } from "class-transformer";
import merge from "lodash/merge";
import "reflect-metadata";

export class UpdateUserBalanceJob {
  @Expose()
  @Type(() => String)
  user: string;

  constructor(defs: Partial<UpdateUserBalanceJob> = {}) {
    merge(this, defs);
  }
}
