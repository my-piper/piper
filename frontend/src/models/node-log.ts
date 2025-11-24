import { Expose, Type } from "class-transformer";

export class NodeLog {
  @Expose()
  @Type(() => String)
  level: "debug" | "info" | "warn" | "error";

  @Expose()
  @Type(() => String)
  message: string;

  @Expose()
  @Type(() => Number)
  job: number;

  @Expose()
  @Type(() => Number)
  attempt: number;
}
