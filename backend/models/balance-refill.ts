import { Expose, Transform, Type } from "class-transformer";
import assign from "lodash/assign";
import "reflect-metadata";
import { dateTransformer } from "../transformers/date";

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
  cursor: string;

  constructor(defs: Partial<BalanceRefill> = {}) {
    assign(this, defs);
  }
}
