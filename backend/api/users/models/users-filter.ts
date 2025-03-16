import { Expose, Type } from "class-transformer";
import { IsOptional, Matches } from "class-validator";
import assign from "lodash/assign";

export class UsersFilter {
  @IsOptional()
  @Expose()
  @Type(() => String)
  search: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9]{26}$/)
  @Expose()
  @Type(() => String)
  cursor: string;

  constructor(defs: Partial<UsersFilter> = {}) {
    assign(this, defs);
  }
}
