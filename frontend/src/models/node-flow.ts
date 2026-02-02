import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";

export class FlowTransformer {
  @Expose()
  @Type(() => String)
  type!: "array" | "json";

  @Expose()
  @Type(() => Number)
  index!: number;

  @Expose()
  @Type(() => String)
  path!: string;
}

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

  @Expose()
  @Type(() => FlowTransformer)
  transformer!: FlowTransformer | null;

  @Expose()
  @Type(() => String)
  index!: "array";

  constructor(defs: Partial<NodeFlow> = {}) {
    assign(this, defs);
  }
}
