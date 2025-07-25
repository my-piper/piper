import {
  dateTransformer,
  Expose,
  Transform,
  Type,
} from "core-kit/packages/transform";
import merge from "lodash/merge";

export class PipelineOutputMetric {
  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Type(() => String)
  output: string;

  @Expose()
  @Transform(dateTransformer())
  filledAt: Date;

  @Expose()
  @Type(() => Number)
  fromStart: number;

  constructor(defs: Partial<PipelineOutputMetric> = {}) {
    merge(this, defs);
  }
}
