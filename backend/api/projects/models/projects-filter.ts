import { Expose, Type } from "class-transformer";
import { IsOptional, Matches } from "class-validator";
import assign from "lodash/assign";

export class ProjectsFilter {
  @IsOptional()
  @Matches(/^[A-Za-z0-9]{26}$/)
  @Expose()
  @Type(() => String)
  cursor: string;

  constructor(defs: Partial<ProjectsFilter> = {}) {
    assign(this, defs);
  }
}
