import {
  dateTransformer,
  Expose,
  Transform,
  Type,
} from "core-kit/packages/transform";
import merge from "lodash/merge";

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
