import { Expose, Transform } from "class-transformer";
import { IsNotEmpty } from "class-validator";
import assign from "lodash/assign";
import merge from "lodash/merge";
import { objectsMapTransformer } from "../transformers/map";
import { primitiveMapTransformer } from "../transformers/primitive";
import { PrimitiveMap } from "../types/primitive";

export class NodeToLaunch {
  @Expose()
  @Transform(primitiveMapTransformer)
  inputs!: PrimitiveMap;

  constructor(defs: Partial<NodeToLaunch> = {}) {
    assign(this, defs);
  }
}

export class LaunchRequest {
  @IsNotEmpty()
  @Expose()
  @Transform(primitiveMapTransformer)
  inputs!: PrimitiveMap;

  @IsNotEmpty()
  @Expose()
  @Transform(objectsMapTransformer(NodeToLaunch))
  nodes: Map<string, NodeToLaunch>;

  constructor(defs: Partial<LaunchRequest> = {}) {
    merge(this, defs);
  }
}
