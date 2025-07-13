import {
  dateTransformer,
  Expose,
  Transform,
  Type,
} from "core-kit/packages/transform";

export class JobOptions {
  @Expose({ name: "attempts" })
  @Type(() => Number)
  maxAttempts?: number;

  @Expose()
  @Type(() => Number)
  delay?: number;
}

export class BullJob {
  @Expose()
  @Type(() => Number)
  id?: number;

  @Expose({ name: "opts" })
  @Type(() => JobOptions)
  options?: JobOptions;

  @Expose()
  @Type(() => Number)
  attemptsMade?: number;

  @Expose({ name: "timestamp" })
  @Transform(dateTransformer("unixtime"))
  createdAt?: Date;

  @Expose({ name: "processedOn" })
  @Transform(dateTransformer("unixtime"))
  processedAt?: Date;

  @Expose({ name: "finishedOn" })
  @Transform(dateTransformer("unixtime"))
  finishedAt?: Date;

  @Expose({ name: "returnvalue" })
  @Type(() => String)
  result?: string;
}
