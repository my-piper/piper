import { Expose, Type } from "class-transformer";

export class AppError extends Error {
  code!: string;

  // Set only on DataError (validation details from the API); absent otherwise.
  details?: object | object[];

  constructor(message: string | null = null) {
    super(message);
  }
}

// An error a component shows: HTTP failures arrive as AppError subclasses, other
// failures as plain Error, so `details` may be missing.
export type DisplayError = Error & Pick<AppError, "details">;

export class NetworkError extends AppError {}

export class UnauthorizedError extends AppError {}

export class NotFoundError extends AppError {}

export class InternalError extends AppError {}

export class DataError extends AppError {
  @Expose()
  @Type(() => Object)
  override details: object | object[];
}

export class RequestTooLargeError extends AppError {}

export class ClientClosedRequestError extends AppError {}

export class TooManyRequestsError extends AppError {}
