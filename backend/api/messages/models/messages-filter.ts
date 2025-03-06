import { Expose, Type } from "class-transformer";
import { IsOptional, Matches } from "class-validator";
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
