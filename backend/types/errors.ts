/** A write clashes with data that already exists; answered with HTTP 409. */
export class ConflictError extends Error {
  constructor(message: string = "Conflict") {
    super(message);
  }
}
