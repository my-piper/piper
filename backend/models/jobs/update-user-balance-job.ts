import { Expose, Type } from "core-kit/packages/transform";
import merge from "lodash/merge";

export class UpdateUserBalanceJob {
  @Expose()
  @Type(() => String)
  user: string;

  constructor(defs: Partial<UpdateUserBalanceJob> = {}) {
    merge(this, defs);
  }
}
