import { Expose, Type } from "core-kit/packages/transform";
import merge from "lodash/merge";

export class CheckPackageUpdatesJob {
  @Expose()
  @Type(() => String)
  nodePackage: string;

  constructor(defs: Partial<CheckPackageUpdatesJob> = {}) {
    merge(this, defs);
  }
}
