import { Expose, Type } from "core-kit/packages/transform";
import merge from "lodash/merge";

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
