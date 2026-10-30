import {
  arrayTransformer,
  Expose,
  IsEnum,
  IsOptional,
  Matches,
  Transform,
  Type,
} from "core-kit/packages/transform";
import { IsBoolean, IsString } from "class-validator";
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
  @IsString({ each: true })
  @Expose()
  @Transform(arrayTransformer<string>())
  tags: string[];

  @IsOptional()
  @IsString()
  @Expose()
  group: string;

  // projects outside any group, like files at the root of a folder tree
  @IsOptional()
  @IsBoolean()
  @Expose()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value
  )
  ungrouped: boolean;

  @IsOptional()
  @Expose()
  @Type(() => String)
  search: string;

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
