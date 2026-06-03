import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
} from "../controllers/project.controller.js";
import {
  validateCreateProject,
  validateProjectIdParam,
  validateUpdateProject,
} from "../validator/project.validator.js";

const router = Router();

router.get("/", authMiddleware, listProjects);
router.post("/", authMiddleware, validateCreateProject, createProject);
router.get("/:id", authMiddleware, validateProjectIdParam, getProject);
router.patch(
  "/:id",
  authMiddleware,
  validateProjectIdParam,
  validateUpdateProject,
  updateProject
);
router.delete("/:id", authMiddleware, validateProjectIdParam, deleteProject);

export { router as projectRouter };
