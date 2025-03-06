import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";
import "reflect-metadata";

export class RunScope {
  @Expose()
  @Type(() => String)
  id: string;

  @Expose()
  @Type(() => Number)
  maxConcurrent: number;

  constructor(defs: Partial<RunScope> = {}) {
    assign(this, defs);
  }
}

export class DeployConfig {
  @Expose()
  @Type(() => String)
  slug!: string;

  @Expose()
  @Type(() => String)
  apiKey!: string;

  @Expose()
  @Type(() => RunScope)
  scope!: RunScope;

  constructor(defs: Partial<DeployConfig> = {}) {
    assign(this, defs);
  }
}
