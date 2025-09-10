import { Expose, Transform } from "class-transformer";
import { IsNotEmpty } from "class-validator";
import { Type } from "core-kit/packages/transform";
import assign from "lodash/assign";
import merge from "lodash/merge";
import { objectsMapTransformer } from "transformers/map";
import { primitiveMapTransformer } from "transformers/primitive";
import { PrimitiveMap } from "types/primitive";

export class Inclusive {
  @Expose()
  @Type(() => String)
  nodes: string[];
}

export class NodeToLaunch {
  @Expose()
  @Transform(primitiveMapTransformer)
  inputs!: PrimitiveMap;

  @Expose()
  @Transform(primitiveMapTransformer)
  outputs!: PrimitiveMap;

  constructor(defs: Partial<NodeToLaunch> = {}) {
    assign(this, defs);
  }
}

export class LaunchRequest {
  @Expose()
  @Type(() => Inclusive)
  inclusive!: Inclusive;

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
