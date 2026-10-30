import { Expose, IsOptional, MaxLength } from "core-kit/packages/transform";
import { IsString } from "class-validator";
import assign from "lodash/assign";

export class ProjectSettings {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Expose()
  group: string | null;

  constructor(defs: Partial<ProjectSettings> = {}) {
    assign(this, defs);
  }
}
