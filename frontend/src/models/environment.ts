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

  /**
   * Bound Variables: the name of a Project Variable mapped to the name of the
   * Global Variable it is read from; a Variable with neither an own value nor
   * a binding reads the Global Variable of the same name.
   */
  @Expose()
  @Transform(primitiveMapTransformer)
  bindings?: Map<string, string>;

  constructor(defs: Partial<Environment> = {}) {
    merge(this, defs);
  }
}
