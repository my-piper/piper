import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";

export class NodeFlow {
  @Expose()
  @Type(() => String)
  from!: string;

  @Expose()
  @Type(() => String)
  output!: string;

  @Expose()
  @Type(() => String)
  to!: string;

  @Expose()
  @Type(() => String)
  input!: string;

  @Expose()
  @Type(() => String)
  color!: string;

  @Expose()
  @Type(() => String)
  mode!: "wait" | "move";

  constructor(defs: Partial<NodeFlow> = {}) {
    assign(this, defs);
  }
}
