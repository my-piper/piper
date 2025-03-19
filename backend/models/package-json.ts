import { Expose, Transform, Type } from "class-transformer";
import assign from "lodash/assign";
import { primitiveMapTransformer } from "transformers/primitive";

export class PackageJson {
  @Expose()
  @Type(() => String)
  name!: string;

  @Expose()
  @Type(() => String)
  version!: string;

  @Expose()
  @Transform(primitiveMapTransformer)
  dependencies!: Map<string, string>;

  constructor(defs: Partial<PackageJson> = {}) {
    assign(this, defs);
  }
}
