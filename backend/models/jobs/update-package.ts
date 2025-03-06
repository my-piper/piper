import { Expose, Type } from "class-transformer";
import merge from "lodash/merge";
import "reflect-metadata";
import { NodePackage } from "../../models/node-package";

export class UpdatePackageJob {
  @Expose()
  @Type(() => NodePackage)
  nodePackage: NodePackage;

  constructor(defs: Partial<UpdatePackageJob> = {}) {
    merge(this, defs);
  }
}
