import { Expose, Transform } from "class-transformer";
import { EnvironmentScope } from "enums/environment-scope";
import assign from "lodash/assign";
import { mapTransformer } from "transformers/object";
import { primitiveMapTransformer } from "transformers/primitive";
import { PrimitiveMap } from "types/primitive";

export class Environment {
  @Expose()
  @Transform(mapTransformer<EnvironmentScope>)
  scope!: Map<string, EnvironmentScope>;

  @Expose()
  @Transform(primitiveMapTransformer)
  variables!: PrimitiveMap;

  constructor(defs: Partial<Environment> = {}) {
    assign(this, defs);
  }
}
