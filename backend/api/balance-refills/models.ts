import { Expose, Type } from "class-transformer";
import { IsOptional, Matches } from "class-validator";

export class BalanceRefillsFilter {
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{26}$/)
  @Expose()
  @Type(() => String)
  cursor: string;
}
