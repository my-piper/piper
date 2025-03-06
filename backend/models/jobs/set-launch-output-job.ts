import { Expose, Type } from "class-transformer";
import merge from "lodash/merge";
import "reflect-metadata";

export class SetLaunchOutputJob {
  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Type(() => String)
  output: string;

  constructor(defs: Partial<SetLaunchOutputJob> = {}) {
    merge(this, defs);
  }
}
