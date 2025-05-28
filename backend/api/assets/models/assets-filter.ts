import {
  Expose,
  IsEnum,
  IsOptional,
  Matches,
  Type,
} from "core-kit/packages/transform";
import assign from "lodash/assign";

export class AssetsFilter {
  @Matches(/^[a-z0-9\-]{5,30}$/)
  @IsOptional()
  @Expose()
  @Type(() => String)
  folder?: string;

  @IsEnum(["image", "video"])
  @IsOptional()
  @Expose()
  @Type(() => String)
  type?: "image" | "video";

  @Matches(/^[a-z0-9\-]{5,30}$/)
  @IsOptional()
  @Expose()
  @Type(() => String)
  project?: string;

  constructor(defs: Partial<AssetsFilter> = {}) {
    assign(this, defs);
  }
}
