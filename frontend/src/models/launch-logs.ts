import { Expose, Transform, Type } from "class-transformer";

export type LogLevel = "debug" | "info" | "warn" | "error";

// a Node Log line in the logs of a whole launch
export class LaunchLog {
  @Expose()
  @Type(() => String)
  node: string;

  @Expose()
  @Type(() => String)
  level: LogLevel;

  @Expose()
  @Type(() => String)
  message: string;

  @Expose()
  @Type(() => Number)
  attempt: number;

  // milliseconds since the epoch; missing on lines stored before it was kept
  @Expose()
  @Type(() => Number)
  ts?: number;
}

export class LaunchLogs {
  // false once the launch's live state, and its logs with it, has expired
  @Expose()
  @Type(() => Boolean)
  available: boolean;

  @Expose()
  @Type(() => LaunchLog)
  logs: LaunchLog[];

  // lines dropped per node to keep each node under the line limit
  @Expose()
  @Transform(({ value }) => value ?? {})
  dropped: Record<string, number>;
}
