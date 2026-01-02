import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";
import "reflect-metadata";
import { RunScope } from "./run-scope";

export class DeployConfig {
  @Expose()
  @Type(() => String)
  prefix!: string;

  @Expose()
  @Type(() => String)
  slug!: string;

  @Expose()
  @Type(() => RunScope)
  scope!: RunScope;

  constructor(defs: Partial<DeployConfig> = {}) {
    assign(this, defs);
  }
}
