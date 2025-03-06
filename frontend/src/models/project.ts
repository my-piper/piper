import { Expose, Type } from "class-transformer";
import { Delta } from "jsondiffpatch";
import assign from "lodash/assign";
import { DeployConfig } from "src/models/deploy";
import { LaunchRequest } from "src/models/launch-request";
import { Pipeline } from "src/models/pipeline";
import { Environment } from "./environment";
import { User } from "./user";

export type ProjectVisibility = "public" | "private";

export class Project {
  @Expose()
  @Type(() => String)
  _id!: string;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => User)
  createdBy!: User;

  @Expose()
  @Type(() => String)
  title!: string;

  @Expose()
  @Type(() => String)
  thumbnail!: string;

  @Expose()
  @Type(() => String)
  revision!: string;

  @Expose()
  @Type(() => Pipeline)
  pipeline!: Pipeline;

  @Expose()
  @Type(() => LaunchRequest)
  launchRequest!: LaunchRequest;

  @Expose()
  @Type(() => DeployConfig)
  deploy!: DeployConfig;

  @Expose()
  @Type(() => Date)
  updatedAt!: Date;

  @Expose()
  @Type(() => User)
  updatedBy!: User;

  @Expose()
  @Type(() => Environment)
  environment!: Environment;

  @Expose()
  @Type(() => String)
  visibility!: ProjectVisibility;

  constructor(defs: Partial<Project> = {}) {
    assign(this, defs);
  }
}

export class PatchProject {
  thumbnail!: string;
  pipeline!: Delta;
  launchRequest!: Delta;
  revision!: string;

  constructor(defs: Partial<PatchProject> = {}) {
    assign(this, defs);
  }
}

export class LaunchProject {
  @Expose()
  @Type(() => String)
  parent!: string;

  @Expose()
  @Type(() => String)
  comment!: string;

  constructor(defs: Partial<LaunchProject> = {}) {
    assign(this, defs);
  }
}
