import { Expose, Type } from "class-transformer";
import { IsOptional, ValidateNested } from "class-validator";
import { Delta } from "jsondiffpatch";

export class PatchProject {
  @IsOptional()
  @Expose()
  @Type(() => Object)
  pipeline!: Delta;

  @IsOptional()
  @ValidateNested()
  @Expose()
  @Type(() => Object)
  launchRequest!: Delta;

  @IsOptional()
  @ValidateNested()
  @Expose()
  @Type(() => Object)
  environment!: Delta;
}
