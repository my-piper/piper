import { Expose, Type } from "class-transformer";
import { IsEnum, IsOptional, Matches } from "class-validator";
import { ProjectVisibility } from "enums/project-visibility";
import assign from "lodash/assign";

export class ProjectsFilter {
  @IsOptional()
  @Expose()
  @IsEnum([ProjectVisibility.public, ProjectVisibility.private])
  @Type(() => String)
  visibility: ProjectVisibility;

  @IsOptional()
  @Expose()
  @Type(() => String)
  category: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9]{26}$/)
  @Expose()
  @Type(() => String)
  cursor: string;

  constructor(defs: Partial<ProjectsFilter> = {}) {
    assign(this, defs);
  }
}
