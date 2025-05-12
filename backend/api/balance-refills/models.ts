import { Expose, IsOptional, Matches, Type } from "core-kit/packages/transform";

export class BalanceRefillsFilter {
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{26}$/)
  @Expose()
  @Type(() => String)
  cursor: string;
}
