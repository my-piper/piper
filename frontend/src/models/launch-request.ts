import { Expose, Transform, Type } from "class-transformer";
import assign from "lodash/assign";
import "reflect-metadata";
import { primitiveMapTransformer } from "src/transformers/primitive";
import { PrimitiveMap } from "src/types/primitive";

export class NodeToLaunch {
  @Expose()
  @Transform(primitiveMapTransformer)
  inputs!: PrimitiveMap;

  constructor(defs: Partial<NodeToLaunch> = {}) {
    assign(this, defs);
  }
}

export class LaunchRequest {
  @Expose()
  @Transform(primitiveMapTransformer)
  inputs!: PrimitiveMap;

  @Expose()
  @Type(() => NodeToLaunch)
  nodes!: Map<string, NodeToLaunch>;

  constructor(defs: Partial<LaunchRequest> = {}) {
    assign(this, defs);
  }
}
