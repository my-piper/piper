import { Expose, Type } from "class-transformer";
import { Project } from "./project";
import { User } from "./user";

export class Batch {
  @Expose()
  @Type(() => String)
  _id: string;

  @Expose()
  @Type(() => Date)
  launchedAt: Date;

  @Expose()
  @Type(() => User)
  launchedBy: User;

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
}
