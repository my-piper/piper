import { Expose, Transform, Type } from "class-transformer";
import { IsArray, IsOptional, IsString } from "class-validator";
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

  /** Names of the Visible Variables; every other string Variable is secret. */
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  visible?: string[];

  /**
   * Bound Variables: the name of a Project Variable mapped to the name of the
   * User Variable it is read from.
   */
  @Expose()
  @IsOptional()
  @Transform(primitiveMapTransformer)
  bindings?: Map<string, string>;

  constructor(defs: Partial<Environment> = {}) {
    assign(this, defs);
  }
}
