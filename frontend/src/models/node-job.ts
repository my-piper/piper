import { Expose, Transform, Type } from "class-transformer";
import { dateTransformer } from "src/transformers/date";

export class NodeJob {
  @Expose()
  @Type(() => Number)
  id?: number;

  @Expose()
  @Type(() => Number)
  maxAttempts?: number;

  @Expose()
  @Type(() => Number)
  attemptsMade?: number;

  @Expose()
  @Transform(dateTransformer())
  createdAt?: Date;

  @Expose()
  @Transform(dateTransformer())
  processedAt?: Date;

  @Expose()
  @Transform(dateTransformer())
  finishedAt?: Date;

  @Expose()
  @Type(() => String)
  result?: string;
}
