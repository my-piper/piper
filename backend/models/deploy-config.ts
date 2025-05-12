import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { RunScope } from "./run-scope";

export class DeployConfig {
  @Expose()
  @Type(() => String)
  slug!: string;

  @Expose()
  @Type(() => String)
  apiKey: string;

  @Expose()
  @Type(() => RunScope)
  scope!: RunScope;

  constructor(defs: Partial<DeployConfig> = {}) {
    assign(this, defs);
  }
}
