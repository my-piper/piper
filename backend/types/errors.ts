import { Expose, Type } from "class-transformer";

export class FatalError extends Error {
  constructor(message: string = "Fatal error") {
    super(message);
  }
}
export class UnknownError extends Error {
  constructor(message: string = "Unknown error") {
    super(message);
  }
}

export class PenTestingError extends Error {
  constructor(message: string = "Pen testing error") {
    super(message);
  }
}

export class DataError extends Error {
  @Expose()
  @Type(() => Object)
  details: object | object[];

  constructor(message: string = "Data error", details: object = {}) {
    super(message);
    this.details = details;
  }
}

export class NotFoundError extends Error {
  constructor(message: string = "Not found") {
    super(message);
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = "Unauthorized") {
    super(message);
  }
}

export class TooManyRequestsError extends Error {
  constructor(message: string = "Too many requests") {
    super(message);
  }
}

export class TimeoutError extends Error {
  constructor(message: string = "Task timeout") {
    super(message);
  }
}

export class UnexpectedTimeout extends Error {
  constructor(message: string) {
    super(message);
  }
}
