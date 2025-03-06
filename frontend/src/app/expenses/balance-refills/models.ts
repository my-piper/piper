import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";

export class BalanceRefillsFilter {
  @Expose()
  @Type(() => String)
  cursor: string;

  constructor(defs: Partial<BalanceRefillsFilter> = {}) {
    assign(this, defs);
  }
}
