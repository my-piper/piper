import { Expose, Type } from "class-transformer";
import { IsOptional } from "class-validator";

export class UploadArtefactRequest {
  @IsOptional()
  @Expose()
  @Type(() => Boolean)
  grayscale?: boolean;
}
