import { Expose, Transform, Type } from "core-kit/packages/transform";
import assign from "lodash/assign";
import { dateTransformer } from "transformers/date";
import { BullJob } from "./bull-job";

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

  constructor(deps: Partial<NodeJob> | BullJob = {}) {
    if (deps instanceof BullJob) {
      const {
        id,
        options: { maxAttempts },
        attemptsMade,
        createdAt,
        processedAt,
        finishedAt,
        result,
      } = deps;
      assign(this, {
        id,
        maxAttempts,
        attemptsMade,
        createdAt,
        processedAt,
        finishedAt,
        result,
      });
    }
  }
}
