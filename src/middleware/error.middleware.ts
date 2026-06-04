import { ApiError } from "../lib/apiError.js";
import type { NextFunction, Request, Response } from "express";

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("Unhandled error:", error);

  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      success: false,
      statusCode: error.statusCode,
      message: error.message,
      error: {
        code: error.code,
        message: error.message,
        ...(error.meta ? { meta: error.meta } : {}),
      },
    });
  }

  return res.status(500).json({
    success: false,
    statusCode: 500,
    message: "Internal server error",
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    },
  });
};
