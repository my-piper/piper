import { Expose, Type } from "class-transformer";

export class AppError extends Error {
  code!: string;

  constructor(message: string | null = null) {
    super(message);
  }
}

export class NetworkError extends AppError {}

export class UnauthorizedError extends AppError {}

export class NotFoundError extends AppError {}

export class InternalError extends AppError {}

export class DataError extends AppError {
  @Expose()
  @Type(() => Object)
  details: object | object[];
}

export class RequestTooLargeError extends AppError {}

export class ClientClosedRequestError extends AppError {}

export class TooManyRequestsError extends AppError {}
