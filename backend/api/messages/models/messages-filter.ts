import { Expose, IsOptional, Matches, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";

export class PipelineMessagesFilter {
  @Matches(/^[a-z0-9]{10}$/)
  @IsOptional()
  @Expose()
  @Type(() => String)
  launch?: string;

  @Matches(/^[a-z0-9\-]{5,30}$/)
  @IsOptional()
  @Expose()
  @Type(() => String)
  project?: string;

  constructor(defs: Partial<PipelineMessagesFilter> = {}) {
    assign(this, defs);
  }
}
