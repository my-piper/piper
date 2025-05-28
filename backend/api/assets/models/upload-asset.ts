import { Expose, IsOptional, Matches, Type } from "core-kit/packages/transform";

export class UploadAsset {
  @Matches(/^[a-z0-9\-]{5,30}$/)
  @IsOptional()
  @Expose()
  @Type(() => String)
  folder?: string;
}
