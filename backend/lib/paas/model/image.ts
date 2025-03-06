import { Expose, Type } from "class-transformer";

export class Image {
  @Expose()
  @Type(() => String)
  base64: string;
}
