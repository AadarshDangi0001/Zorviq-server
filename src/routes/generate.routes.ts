
import { Router, Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  enqueueGeneration,
  streamGeneration,
  getGenerationStatus,
  getGenerationHistory,
} from "../controllers/generate.controller.js";
import { ValidationError } from "../lib/apiError.js";
 
const router = Router();
 

const enqueueSchema = z.object({
  projectId: z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid projectId format"),
 
  prompt: z
    .string()
    .min(5, "Prompt must be at least 5 characters")
    .max(2000, "Prompt must not exceed 2000 characters")
    .transform((s) => s.trim()),
 
  isSectionEdit: z.boolean().optional().default(false),
 
  sectionId: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9-]+$/,
      "sectionId must be lowercase alphanumeric with hyphens"
    )
    .optional()
    .nullable()
    .default(null),
 
  sectionHtml: z
    .string()
    .max(50_000, "sectionHtml too large")
    .optional()
    .nullable()
    .default(null),
}).refine(
  (data) => {
    // If isSectionEdit is true, sectionId must be provided
    if (data.isSectionEdit && !data.sectionId) return false;
    return true;
  },
  {
    message: "sectionId is required when isSectionEdit is true",
    path: ["sectionId"],
  }
);
 

function validate<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const message = err.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        next(new ValidationError(message));
      } else {
        next(err);
      }
    }
  };
}
 

router.post(
  "/",
  authMiddleware,
  validate(enqueueSchema),
  enqueueGeneration
);
 

router.get(
  "/stream/:jobId",
  authMiddleware,
  streamGeneration
);
 

router.get(
  "/status/:jobId",
  authMiddleware,
  getGenerationStatus
);
 

router.get(
  "/history/:projectId",
  authMiddleware,
  getGenerationHistory
);
 
export { router as generateRouter };