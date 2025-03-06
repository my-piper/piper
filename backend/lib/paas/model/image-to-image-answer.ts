import { Expose, Type } from "class-transformer";

class Image {
  @Expose()
  @Type(() => String)
  base64: string;

  @Expose()
  @Type(() => String)
  language: string;
}

export class ImageToImageAnswer {
  @Expose()
  @Type(() => Image)
  images: Image[];
}
