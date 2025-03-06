import { Expose, Transform, Type } from "class-transformer";
import "reflect-metadata";
import { dateTransformer } from "../transformers/date";

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
}
