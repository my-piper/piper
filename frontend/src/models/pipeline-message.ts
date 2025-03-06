import { Expose, Type } from "class-transformer";
import assign from "lodash/assign";
import "reflect-metadata";

export class PipelineMessagesFilter {
  @Expose()
  @Type(() => String)
  launch?: string;

  @Expose()
  @Type(() => String)
  project?: string;

  constructor(defs: Partial<PipelineMessagesFilter> = {}) {
    assign(this, defs);
  }
}

export class PipelineMessage {
  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Type(() => String)
  node: string;

  @Expose()
  @Type(() => String)
  type: string;

  @Expose()
  @Type(() => String)
  message: string;
}
