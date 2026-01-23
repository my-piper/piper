import "reflect-metadata";

import { Expose, Transform, Type } from "class-transformer";
import assign from "lodash/assign";
import { primitiveMapTransformer } from "src/transformers/primitive";
import { PrimitiveMap } from "src/types/primitive";

export class LaunchOptions {
  @Expose()
  @Type(() => String)
  bucket: "artefact" | "output" | null;
}

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
  @Type(() => LaunchOptions)
  options!: LaunchOptions;

  @Expose()
  @Type(() => Inclusive)
  inclusive!: Inclusive;

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
