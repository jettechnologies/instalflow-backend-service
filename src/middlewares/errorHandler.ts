import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import ApiResponse from "../libs/ApiResponse";
import AppError, { ErrorType } from "../libs/AppError";
import logger from "../libs/logger";

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Always log the full error server-side
  logger.error("Unhandled error", {
    message: err?.message,
    stack: err?.stack,
    type: err?.constructor?.name,
  });

  // Zod validation
  if (err instanceof ZodError) {
    return ApiResponse.validation(
      res,
      err.issues.map((e) => e.message).join(", "),
    );
  }

  // App errors (operational, safe to surface)
  if (err instanceof AppError) {
    switch (err.errorType) {
      case ErrorType.NOT_FOUND:
        return ApiResponse.notFound(res, err.message);

      case ErrorType.BAD_REQUEST:
        return ApiResponse.badRequest(res, err.message);

      case ErrorType.CONFLICT:
        return ApiResponse.conflict(res, err.message);

      case ErrorType.UNAUTHORIZED:
        return ApiResponse.unauthorized(res, err.message);

      case ErrorType.FORBIDDEN:
        return ApiResponse.error(res, 403, err.message, "Authorization Error");

      default:
        return ApiResponse.error(
          res,
          500,
          "Something went wrong",
          "Internal Server Error",
        );
    }
  }

  // Unknown/unexpected errors — never leak internals to the client
  return ApiResponse.internalServerError(res, "An unexpected error occurred");
}
