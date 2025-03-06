import { Expose, Type } from "class-transformer";

export class Image {
  @Expose()
  @Type(() => String)
  base64: string;

  @Expose()
  @Type(() => String)
  url: string;
}

export class TextToImageAnswer {
  @Expose()
  @Type(() => Image)
  images: Image[];
}
