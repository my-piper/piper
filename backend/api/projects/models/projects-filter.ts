import {
  Expose,
  IsEnum,
  IsOptional,
  Matches,
  Type,
} from "core-kit/packages/transform";
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
  @Expose()
  @Type(() => String)
  tag: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9]{26}$/)
  @Expose()
  @Type(() => String)
  cursor: string;

  @IsOptional()
  @IsEnum(["cursor", "order"])
  @Expose()
  @Type(() => String)
  sort?: "cursor" | "order";

  constructor(defs: Partial<ProjectsFilter> = {}) {
    assign(this, defs);
  }
}
