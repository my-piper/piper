import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";

export class InputFlow {
  @Expose()
  @Type(() => String)
  to!: string;

  @Expose()
  @Type(() => String)
  input!: string;

  constructor(defs: Partial<InputFlow> = {}) {
    assign(this, defs);
  }
}
