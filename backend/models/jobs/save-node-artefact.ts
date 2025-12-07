import { Expose, Type } from "core-kit/packages/transform";
import merge from "lodash/merge";

export class SaveNodeArtefactsJob {
  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Type(() => String)
  node: string;

  constructor(defs: Partial<SaveNodeArtefactsJob> = {}) {
    merge(this, defs);
  }
}
