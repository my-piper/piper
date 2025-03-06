import { Expose, Type } from "class-transformer";

export class Mask {
  @Expose()
  @Type(() => String)
  image: string;

  @Expose()
  @Type(() => String)
  mask: string;

  @Expose()
  @Type(() => Number)
  confidence: number;

  @Expose()
  @Type(() => String)
  className: string;

  @Expose()
  @Type(() => Number)
  coordinates: number[];
}

export class ImageToMaskAnswer {
  @Expose()
  @Type(() => Mask)
  masks: Mask[];
}
