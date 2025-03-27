import { Expose, Type } from "class-transformer";
import { Delta } from "jsondiffpatch";
import assign from "lodash/assign";
import { ProjectVisibility } from "src/enums/project-visibility";
import { LaunchRequest } from "src/models/launch-request";
import { Pipeline } from "src/models/pipeline";
import { Deploy } from "./deploy";
import { Environment } from "./environment";
import { User } from "./user";

export class Project {
  @Expose()
  @Type(() => String)
  _id!: string;

  @Expose()
  @Type(() => String)
  slug!: string;

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
  revision!: string;

  @Expose()
  @Type(() => Pipeline)
  pipeline!: Pipeline;

  @Expose()
  @Type(() => LaunchRequest)
  launchRequest!: LaunchRequest;

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
  @Type(() => Deploy)
  deploy!: Deploy;

  @Expose()
  @Type(() => String)
  visibility!: ProjectVisibility;

  @Expose()
  @Type(() => Number)
  order?: number;

  @Expose()
  @Type(() => String)
  cursor!: string;

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

export class ProjectsFilter {
  @Expose()
  @Type(() => String)
  visibility!: ProjectVisibility;

  @Expose()
  @Type(() => String)
  category?: string;

  @Expose()
  @Type(() => String)
  cursor?: string;

  constructor(defs: Partial<ProjectsFilter> = {}) {
    assign(this, defs);
  }
}
