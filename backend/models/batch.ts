import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";
import { Project } from "./project";
import { User } from "./user";

export class Batch {
  @Expose()
  @Type(() => String)
  _id: string;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => User)
  createdBy: User;

  @Expose()
  @Type(() => String)
  title: string;

  @Expose()
  @Type(() => Project)
  project: Project;

  @Expose()
  @Type(() => String)
  base: string;

  @Expose()
  @Type(() => String)
  spreadsheet: string;

  @Expose()
  @Type(() => Number)
  total: number;

  @Expose()
  @Type(() => Number)
  launched: number;

  constructor(defs: Partial<Batch> = {}) {
    assign(this, defs);
  }
}
