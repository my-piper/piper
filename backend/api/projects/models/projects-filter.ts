import {
  arrayTransformer,
  Expose,
  IsOptional,
  Matches,
  Transform,
  Type,
} from "core-kit/packages/transform";
import { IsBoolean, IsString } from "class-validator";
import assign from "lodash/assign";

export class ProjectsFilter {
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

  constructor(defs: Partial<ProjectsFilter> = {}) {
    assign(this, defs);
  }
}
