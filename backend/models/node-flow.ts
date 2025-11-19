import { Expose, Type } from "core-kit/packages/transform";

export class FlowTransformer {
  @Expose()
  @Type(() => String)
  type!: "array";

  @Expose()
  @Type(() => Number)
  index!: number;
}

export class NodeFlow {
  @Expose()
  @Type(() => String)
  from: string;

  @Expose()
  @Type(() => String)
  output: string;

  @Expose()
  @Type(() => String)
  to: string;

  @Expose()
  @Type(() => String)
  input: string;

  @Expose()
  @Type(() => String)
  mode!: "wait" | "move";

  @Expose()
  @Type(() => FlowTransformer)
  transformer!: FlowTransformer | null;
}
