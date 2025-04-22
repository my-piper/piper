import { Expose, Transform, Type } from "class-transformer";
import merge from "lodash/merge";
import "reflect-metadata";
import { dateTransformer } from "../transformers/date";

export class PipelineFinishedMetric {
  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Type(() => String)
  pipelineName: string;

  @Expose()
  @Transform(dateTransformer())
  finishedAt: Date;

  @Expose()
  @Type(() => Number)
  durationSecs: number;

  @Expose()
  @Type(() => Number)
  errorsCount: number;

  constructor(defs: Partial<PipelineFinishedMetric> = {}) {
    merge(this, defs);
  }
}
