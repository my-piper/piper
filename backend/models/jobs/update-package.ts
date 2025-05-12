import { Expose, Type } from "core-kit/packages/transform";
import merge from "lodash/merge";
import { NodePackage } from "models/node-package";

export class UpdatePackageJob {
  @Expose()
  @Type(() => NodePackage)
  nodePackage: NodePackage;

  constructor(defs: Partial<UpdatePackageJob> = {}) {
    merge(this, defs);
  }
}
