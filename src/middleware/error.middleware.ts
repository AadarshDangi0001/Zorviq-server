import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/apiError.js";

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("Unhandled error:", error);

  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      message: error.message,
      success: false,
      ...(error.errors ? { errors: error.errors } : {})
    });
  }

  return res.status(500).json({
    message: "Internal server error",
    success: false
  });
};
