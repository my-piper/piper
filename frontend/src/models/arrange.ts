import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";

export class Arrange {
  @Expose()
  @Type(() => Number)
  x!: number;

  @Expose()
  @Type(() => Number)
  y!: number;

  constructor(defs: Partial<Arrange> = {}) {
    assign(this, defs);
  }
}
