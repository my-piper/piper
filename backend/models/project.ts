import {
  Expose,
  IsNotEmpty,
  MinLength,
  Type,
} from "core-kit/packages/transform";
import assign from "lodash/assign";
import { Deploy } from "./deploy";
import { Environment } from "./environment";
import { LaunchRequest } from "./launch-request";
import { Pipeline } from "./pipeline";
import { PipelineCategory } from "./pipeline-category";
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
  tags!: string[];

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
  @Type(() => Deploy)
  deploy!: Deploy;

  @Expose()
  @Type(() => Environment)
  environment!: Environment;

  @Expose()
  @Type(() => String)
  visibility!: "public" | "private";

  @Expose()
  @Type(() => Date)
  updatedAt!: Date;

  @Expose()
  @Type(() => User)
  updatedBy!: User;

  @Expose()
  @Type(() => PipelineCategory)
  category!: PipelineCategory;

  @Expose()
  @Type(() => String)
  cursor: string;

  @Expose()
  @Type(() => Number)
  order: number;

  constructor(defs: Partial<Project> = {}) {
    assign(this, defs);
  }
}

export class ProjectComment {
  @Expose()
  @Type(() => String)
  _id!: string;

  @Expose()
  @Type(() => String)
  project!: string;

  @Expose()
  @Type(() => Date)
  createdAt!: Date;

  @Expose()
  @Type(() => User)
  createdBy!: User;

  @IsNotEmpty()
  @MinLength(10)
  @Expose()
  @Type(() => String)
  message: string;
}

export class ProjectCommentsFilter {
  @Expose()
  @Type(() => String)
  cursor?: string;

  constructor(defs: Partial<ProjectCommentsFilter> = {}) {
    assign(this, defs);
  }
}

export class ProjectSummary {
  @Expose()
  @Type(() => Number)
  comments?: number;
}
