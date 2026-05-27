import type { NextFunction, Request, Response } from "express";

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("Unhandled error:", error);

  const statusCode = (error as any).statusCode || 500;
  const message = error.message || "Internal server error";

  return res.status(statusCode).json({
    message,
    success: false,
    error: process.env.NODE_ENV === "development" ? error.stack : undefined,
  });
};
