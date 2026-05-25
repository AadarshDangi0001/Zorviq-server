import type { ErrorRequestHandler } from 'express';
import jsonwebtoken from 'jsonwebtoken';
import mongoose from 'mongoose';

import { config } from '../config/config.js';
import { ApiError } from '../lib/apiError.js';
import { ApiResponse } from '../lib/apiResponse.js';
import { logger } from '../lib/logger.js';

type MongoDuplicateKeyError = Error & {
  code: 11000;
  keyValue?: Record<string, unknown>;
};

const isMongoDuplicateKeyError = (error: unknown): error is MongoDuplicateKeyError =>
  error instanceof Error && 'code' in error && error.code === 11000;

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  logger.error('Request failed', {
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
  });

  if (error instanceof ApiError) {
    ApiResponse.error(res, error.message, error.statusCode, error.errors);
    return;
  }

  if (isMongoDuplicateKeyError(error)) {
    const field = Object.keys(error.keyValue ?? {})[0] ?? 'field';
    ApiResponse.error(res, `${field} already exists`, 409);
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(error.errors).map((validationError) => validationError.message);
    ApiResponse.error(res, messages.join(', '), 400, messages);
    return;
  }

  if (error instanceof jsonwebtoken.JsonWebTokenError) {
    ApiResponse.error(res, 'Invalid token', 401);
    return;
  }

  if (error instanceof jsonwebtoken.TokenExpiredError) {
    ApiResponse.error(res, 'Token expired', 401);
    return;
  }

  const stack = error instanceof Error && error.stack ? [error.stack] : [];
  ApiResponse.error(res, 'Something went wrong', 500, config.server.isDevelopment ? stack : []);
};
