import {
  Expose,
  IsOptional,
  Type,
  ValidateNested,
} from "core-kit/packages/transform";
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
