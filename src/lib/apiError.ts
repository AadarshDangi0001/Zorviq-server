export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errors: readonly unknown[];
  public readonly isOperational = true;

  public constructor(statusCode: number, message: string, errors: readonly unknown[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}
