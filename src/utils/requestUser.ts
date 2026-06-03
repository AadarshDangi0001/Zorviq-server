import type { Request } from "express";
import { ValidationError } from "../lib/apiError.js";

export function getAuthenticatedUserId(req: Request): string {
  const user = req.user as { _id?: unknown } | undefined;
  if (!user?._id) {
    throw new ValidationError("Unauthorized user.");
  }

  return String(user._id);
}
