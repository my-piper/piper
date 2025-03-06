import { Expose, Transform, Type } from "class-transformer";
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
}
