import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";
import { Pipeline } from "../models/pipeline";
import { Environment } from "./environment";
import { LaunchRequest } from "./launch-request";
import { Project } from "./project";
import { RunScope } from "./run-scope";

export class Deploy {
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
