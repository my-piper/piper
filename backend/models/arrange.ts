import { Expose, Type } from "core-kit/packages/transform";

export class Arrange {
  @Expose()
  @Type(() => Number)
  x: number;

  @Expose()
  @Type(() => Number)
  y: number;
}
