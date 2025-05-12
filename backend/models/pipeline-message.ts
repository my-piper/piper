import { Expose, Transform, Type } from "core-kit/packages/transform";
import assign from "lodash/lodash";
import { dateTransformer } from "transformers/date";

export class PipelineMessage {
  @Expose()
  @Transform(dateTransformer())
  createdAt: Date;

  @Expose()
  @Type(() => String)
  project: string;

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

  constructor(defs: Partial<PipelineMessage> = {}) {
    assign(this, defs);
  }
}
