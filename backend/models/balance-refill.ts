import { Expose, Transform, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { dateTransformer } from "transformers/date";

export class BalanceRefill {
  @Expose()
  @Type(() => String)
  user: string;

  @Expose()
  @Transform(dateTransformer())
  refilledAt: Date;

  @Expose()
  @Type(() => Number)
  amount: number;

  @Expose()
  @Type(() => String)
  url: string;

  @Expose()
  @Type(() => String)
  cursor: string;

  constructor(defs: Partial<BalanceRefill> = {}) {
    assign(this, defs);
  }
}
