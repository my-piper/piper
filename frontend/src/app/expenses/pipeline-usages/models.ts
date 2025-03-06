import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";

export class PipelineUsagesFilter {
  @Expose()
  @Type(() => String)
  cursor: string;

  constructor(defs: Partial<PipelineUsagesFilter> = {}) {
    assign(this, defs);
  }
}
