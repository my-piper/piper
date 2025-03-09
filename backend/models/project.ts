import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";
import "reflect-metadata";
import { Deploy } from "./deploy";
import { Environment } from "./environment";
import { LaunchRequest } from "./launch-request";
import { Pipeline } from "./pipeline";
import { User } from "./user";

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
  @Type(() => String)
  cursor: string;

  constructor(defs: Partial<Project> = {}) {
    assign(this, defs);
  }
}
