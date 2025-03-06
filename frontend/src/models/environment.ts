import { Expose, Transform } from "class-transformer";
import { merge } from "lodash";
import { PrimitiveMap } from "src/types/primitive";
import { primitiveMapTransformer } from "../transformers/primitive";

export class Environment {
  @Expose()
  @Transform(primitiveMapTransformer)
  variables!: PrimitiveMap;

  constructor(defs: Partial<Environment> = {}) {
    merge(this, defs);
  }
}
