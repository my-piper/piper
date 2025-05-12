import { Expose, Transform, Type } from "core-kit/packages/transform";
import { dateTransformer } from "transformers/date";

export class PipelineErrorRecord {
  @Expose()
  @Transform(dateTransformer())
  occurredAt: Date;

  @Expose()
  @Type(() => String)
  launch: string;

  @Expose()
  @Type(() => String)
  project: string;

  @Expose()
  @Type(() => String)
  projectTitle: string;

  @Expose()
  @Type(() => String)
  node: string;

  @Expose()
  @Type(() => String)
  nodeTitle: string;

  @Expose()
  @Type(() => Number)
  attempt: number;

  @Expose()
  @Type(() => Number)
  maxAttempts: number;

  @Expose()
  @Type(() => String)
  message: string;
}
