import type { Request } from 'express';
import { Types } from 'mongoose';
import { ValidationError } from '../lib/apiError.js';

export function getAuthenticatedUserId(req: Request): string {
  const user = req.user as { _id?: unknown } | undefined;
  if (!user?._id) {
    throw new ValidationError('Unauthorized user.');
  }

  const userId = user._id;
  if (typeof userId === 'string') {
    return userId;
  }

  if (userId instanceof Types.ObjectId) {
    return userId.toHexString();
  }

  throw new ValidationError('Unauthorized user.');
}
