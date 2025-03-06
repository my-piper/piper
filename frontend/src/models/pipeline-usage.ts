import { Expose, Transform, Type } from "class-transformer";
import "reflect-metadata";
import { dateTransformer } from "../transformers/date";

export class PipelineUsage {
  @Expose()
  @Type(() => String)
  project: string;

  @Expose()
  @Type(() => String)
  pipeline: string;

  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Type(() => String)
  launchedBy: string;

  @Expose()
  @Type(() => String)
  node: string;

  @Expose()
  @Transform(dateTransformer())
  processedAt: Date;

  @Expose()
  @Type(() => Number)
  costs: number;

  @Expose()
  @Type(() => String)
  cursor: string;
}
