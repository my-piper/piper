import { Expose, Transform } from "class-transformer";
import { merge } from "lodash";
import { PrimitiveMap } from "src/types/primitive";
import { primitiveMapTransformer } from "../transformers/primitive";

export class Environment {
  @Expose()
  @Transform(primitiveMapTransformer)
  variables!: PrimitiveMap;

  /** Names of the Visible Variables; every other string Variable is secret. */
  @Expose()
  visible?: string[];

  constructor(defs: Partial<Environment> = {}) {
    merge(this, defs);
  }
}
