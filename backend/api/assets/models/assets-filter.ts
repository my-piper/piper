import { Expose, Type } from "class-transformer";
import { IsEnum, IsOptional, Matches } from "class-validator";
import assign from "lodash/assign";

export class AssetsFilter {
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
