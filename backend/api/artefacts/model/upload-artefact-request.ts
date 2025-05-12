import { Expose, IsOptional, Type } from "core-kit/packages/transform";

export class UploadArtefactRequest {
  @IsOptional()
  @Expose()
  @Type(() => Boolean)
  grayscale?: boolean;
}
