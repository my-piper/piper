import { Expose, Transform } from "class-transformer";
import assign from "lodash/assign";
import { primitiveMapTransformer } from "../transformers/primitive";
import { PrimitiveMap } from "../types/primitive";

export class Environment {
  @Expose()
  @Transform(primitiveMapTransformer)
  variables!: PrimitiveMap;

  constructor(defs: Partial<Environment> = {}) {
    assign(this, defs);
  }
}
