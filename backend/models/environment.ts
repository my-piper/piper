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
   * Bound Variables bound to a Global Variable of another name: the name of a
   * Project Variable mapped to the Global Variable it is read from. A Project
   * Variable without an own value or an entry here reads the Global Variable
   * of the same name.
   */
  @Expose()
  @IsOptional()
  @Transform(primitiveMapTransformer)
  bindings?: Map<string, string>;

  constructor(defs: Partial<Environment> = {}) {
    assign(this, defs);
  }
}
