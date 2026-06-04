import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { ValidationError } from '../lib/apiError.js';

export const objectIdString = (message: string) => z.string().regex(/^[a-f\d]{24}$/i, message);

export function validate<T extends z.ZodTypeAny>(schema: T, target: 'body' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // The target is restricted to the literal union accepted by this helper.
      // eslint-disable-next-line security/detect-object-injection
      const parsed = schema.parse(req[target]);
      if (target === 'body') {
        req.body = parsed;
      } else {
        req.params = parsed as unknown as Request['params'];
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const message = err.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        next(new ValidationError(message));
      } else {
        next(err);
      }
    }
  };
}
