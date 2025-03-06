import { Expose, Transform, Type } from "class-transformer";
import merge from "lodash/merge";
import "reflect-metadata";
import { dateTransformer } from "../transformers/date";

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
