import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";
import { Pipeline } from "src/models/pipeline";
import { Environment } from "./environment";
import { LaunchRequest } from "./launch-request";
import { RunScope } from "./run-scope";

export class Deploy {
  @Expose()
  @Type(() => String)
  _id!: string;

  @Expose()
  @Type(() => Date)
  deployedAt!: Date;

  @Expose()
  @Type(() => String)
  prefix!: string;

  @Expose()
  @Type(() => String)
  slug!: string;

  @Expose()
  @Type(() => Pipeline)
  pipeline!: Pipeline;

  @Expose()
  @Type(() => LaunchRequest)
  launchRequest!: LaunchRequest;

  @Expose()
  @Type(() => Environment)
  environment!: Environment;

  @Expose()
  @Type(() => RunScope)
  scope!: RunScope;

  constructor(defs: Partial<Deploy> = {}) {
    assign(this, defs);
  }
}
