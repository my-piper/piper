import {
  Expose,
  IsOptional,
  Transform,
  Type,
  dateTransformer,
  objectTransformer,
} from "core-kit/packages/transform";
import {
  DataError,
  FatalError,
  MemoryLimitError,
  TimeoutError,
  UnknownError,
} from "core-kit/types/errors";

type LogLevel = "debug" | "info" | "warn" | "error";

export class ExecutionError extends Error {
  @Expose()
  @Type(() => String)
  override message: string;

  @Expose()
  @Type(() => String)
  override stack: string;

  @Expose()
  @Transform(objectTransformer)
  details: object;

  @IsOptional()
  @Expose()
  @Type(() => String)
  code: "DATA_ERROR" | "TIMEOUT_ERROR" | "FATAL_ERROR" | "MEMORY_LIMIT_ERROR";

  @Expose()
  @Type(() => LogEntry)
  logs: LogEntry[];

  typed() {
    switch (this.code) {
      case "DATA_ERROR":
        return new DataError(this.message, this.details, this.stack);
      case "TIMEOUT_ERROR":
        return new TimeoutError(this.message, this.stack);
      case "FATAL_ERROR":
        return new FatalError(this.message, this.stack);
      case "MEMORY_LIMIT_ERROR":
        return new MemoryLimitError(this.message, this.stack);
      default:
        return new UnknownError(this.message, this.stack);
    }
  }
}

export class LogEntry {
  @Transform(dateTransformer("unixtime"))
  ts: Date;

  @Expose()
  @Type(() => String)
  level: LogLevel;

  @Expose()
  @Type(() => String)
  message: string;
}

export class ExecuteRequest {
  @Expose()
  @Type(() => String)
  script: string;

  @Expose()
  @Type(() => String)
  fn: string;

  @Transform(objectTransformer)
  @Expose()
  payload: object;

  @Expose()
  @Type(() => Number)
  timeout?: number;

  @Expose()
  @Type(() => String)
  isolation?: "none" | "process";
}

export class ExecutionResult {
  @Expose()
  result: unknown;

  @Expose()
  @Type(() => LogEntry)
  logs: LogEntry[];
}
