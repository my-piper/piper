import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { Pipeline } from "models/pipeline";
import { Environment } from "./environment";
import { LaunchRequest } from "./launch-request";
import { Project } from "./project";
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

  @Expose()
  @Type(() => Project)
  project!: Project;

  constructor(defs: Partial<Deploy> = {}) {
    assign(this, defs);
  }
}
