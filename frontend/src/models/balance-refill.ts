import { Expose, Transform, Type } from "class-transformer";
import "reflect-metadata";
import { dateTransformer } from "../transformers/date";

export class BalanceRefill {
  @Expose()
  @Transform(dateTransformer())
  refilledAt: Date;

  @Expose()
  @Type(() => Number)
  amount: number;

  @Expose()
  @Type(() => String)
  cursor: string;
}
