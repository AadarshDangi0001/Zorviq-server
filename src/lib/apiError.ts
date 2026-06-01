export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly meta?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, field?: string) {
    super(400, "VALIDATION_ERROR", message, field ? { field } : undefined);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized") {
    super(401, "UNAUTHORIZED", message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super(404, "NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string, public readonly retryAfter?: number) {
    super(
      429,
      "RATE_LIMIT_EXCEEDED",
      message,
      retryAfter ? { retryAfter } : undefined
    );
    this.name = "RateLimitError";
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(message = "Service temporarily unavailable") {
    super(503, "SERVICE_UNAVAILABLE", message);
    this.name = "ServiceUnavailableError";
  }
}
