import { Expose, Type } from "class-transformer";
import merge from "lodash/merge";
import "reflect-metadata";

export class CheckPackageUpdatesJob {
  @Expose()
  @Type(() => String)
  nodePackage: string;

  constructor(defs: Partial<CheckPackageUpdatesJob> = {}) {
    merge(this, defs);
  }
}
