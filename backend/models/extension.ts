import { Expose, Transform, Type } from "class-transformer";
import { primitiveMapTransformer } from "transformers/primitive";
import { Primitive } from "types/primitive";

export class Extension {
  @Expose()
  @Type(() => String)
  id: string;

  @Expose()
  @Transform(primitiveMapTransformer)
  params: { [key: string]: Primitive };
}
