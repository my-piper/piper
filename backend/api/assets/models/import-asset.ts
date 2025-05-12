import {
  Expose,
  IsOptional,
  IsUrl,
  Matches,
  Type,
} from "core-kit/packages/transform";

export class ImportAsset {
  @IsUrl()
  @Expose()
  @Type(() => String)
  url?: string;

  @Matches(/^[a-z0-9\-]{5,30}$/)
  @IsOptional()
  @Expose()
  @Type(() => String)
  project?: string;
}
