import { Expose, Type } from "class-transformer";
import { IsOptional, IsUrl, Matches } from "class-validator";

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
