import { Expose, Type } from "class-transformer";
import { IsOptional, Matches } from "class-validator";
import assign from "lodash/assign";

export class LaunchesFilter {
  @Matches(/^(null|[a-z0-9]{5,10})$/)
  @IsOptional()
  @Expose()
  @Type(() => String)
  parent?: string;

  @Matches(/^[a-z0-9\-]{5,30}$/)
  @IsOptional()
  @Expose()
  @Type(() => String)
  project?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9]{26}$/)
  @Expose()
  @Type(() => String)
  cursor: string;

  constructor(defs: Partial<LaunchesFilter> = {}) {
    assign(this, defs);
  }
}
