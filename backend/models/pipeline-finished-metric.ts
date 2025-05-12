import { Expose, Transform, Type } from "core-kit/packages/transform";
import merge from "lodash/merge";
import { dateTransformer } from "transformers/date";

export class PipelineFinishedMetric {
  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Transform(dateTransformer())
  finishedAt: Date;

  @Expose()
  @Type(() => Number)
  fromStart: number;

  constructor(defs: Partial<PipelineFinishedMetric> = {}) {
    merge(this, defs);
  }
}
