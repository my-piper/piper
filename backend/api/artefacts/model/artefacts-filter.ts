import {
  Expose,
  IsEnum,
  IsOptional,
  Matches,
  Type,
} from "core-kit/packages/transform";
import assign from "lodash/assign";

export class ArtefactsFilter {
  @IsEnum(["image", "archive", "audio", "video"])
  @IsOptional()
  @Expose()
  @Type(() => String)
  type?: string;

  @Matches(/^[a-z0-9\-]{5,30}$/)
  @IsOptional()
  @Expose()
  @Type(() => String)
  project?: string;

  @Matches(/^[a-z0-9\-]{5,30}$/)
  @IsOptional()
  @Expose()
  @Type(() => String)
  launch?: string;

  @Matches(/^[a-z0-9\-]{5,30}$/)
  @IsOptional()
  @Expose()
  @Type(() => String)
  node?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9]{26}$/)
  @Expose()
  @Type(() => String)
  cursor: string;

  constructor(defs: Partial<ArtefactsFilter> = {}) {
    assign(this, defs);
  }
}
