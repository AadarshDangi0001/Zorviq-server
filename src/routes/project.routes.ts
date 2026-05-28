import { Router, Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { ValidationError } from "../lib/apiError.js";
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
} from "../controllers/project.controller.js";

const router = Router();

const idParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid project ID format"),
});

const createProjectSchema = z.object({
  name: z.string().trim().min(3, "Project name must be at least 3 characters").max(100, "Project name must not exceed 100 characters"),
  currentCode: z.string().optional().nullable(),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(3, "Project name must be at least 3 characters").max(100, "Project name must not exceed 100 characters").optional(),
  currentCode: z.string().optional().nullable(),
});

function validate<T extends z.ZodTypeAny>(schema: T, target: "body" | "params" = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[target]);
      if (target === "body") {
        req.body = parsed;
      } else {
        req.params = parsed as unknown as Request["params"];
      }
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

router.get("/", authMiddleware, listProjects);
router.post("/", authMiddleware, validate(createProjectSchema), createProject);
router.get("/:id", authMiddleware, validate(idParamSchema, "params"), getProject);
router.patch(
  "/:id",
  authMiddleware,
  validate(idParamSchema, "params"),
  validate(updateProjectSchema),
  updateProject
);
router.delete("/:id", authMiddleware, validate(idParamSchema, "params"), deleteProject);

export { router as projectRouter };
