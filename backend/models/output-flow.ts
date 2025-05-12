import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";

export class OutputFlow {
  @Expose()
  @Type(() => String)
  from!: string;

  @Expose()
  @Type(() => String)
  output!: string;

  constructor(defs: Partial<OutputFlow> = {}) {
    assign(this, defs);
  }
}
