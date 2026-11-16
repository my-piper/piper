import { Expose, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";

export class RepeatJob<T extends object> {
  job: T;
  delay: number;

  constructor(defs: Partial<RepeatJob<T>>) {
    assign(this, defs);
  }
}

export class QueueJob {
  @Expose({ name: "returnvalue" })
  @Type(() => String)
  results: string;
}
