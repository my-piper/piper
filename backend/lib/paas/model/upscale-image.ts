import { Expose, Type } from "class-transformer";
import { Image } from "./image";

export class UpscaleImageAnswer {
  @Expose()
  @Type(() => Image)
  image: Image;
}
