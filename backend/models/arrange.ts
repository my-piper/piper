import { Expose, Type } from "class-transformer";

export class Arrange {
  @Expose()
  @Type(() => Number)
  x: number;

  @Expose()
  @Type(() => Number)
  y: number;
}
