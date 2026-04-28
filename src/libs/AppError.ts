export enum ErrorType {
  BAD_REQUEST = "Bad Request",
  UNAUTHORIZED = "Authentication Error",
  FORBIDDEN = "Authorization Error",
  NOT_FOUND = "Not Found",
  CONFLICT = "Conflict Error",
  VALIDATION = "Validation Error",
}

export default class AppError extends Error {
  public statusCode: number;
  public errorType: ErrorType;

  constructor(statusCode: number, message: string, errorType: ErrorType) {
    super(message);
    this.statusCode = statusCode;
    this.errorType = errorType;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad Request") {
    super(400, message, ErrorType.BAD_REQUEST);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, ErrorType.UNAUTHORIZED);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message, ErrorType.FORBIDDEN);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not Found") {
    super(404, message, ErrorType.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(409, message, ErrorType.CONFLICT);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(422, message, ErrorType.VALIDATION);
  }
}
