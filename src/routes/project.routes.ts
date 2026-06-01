import { Router } from "express";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { validateProjectId, validateCreateProject, validateRenameProject } from "../middleware/validators/project.validator.js";
import { getAllProjects, createProject, getProject, renameProject, deleteProject } from "../controllers/project.controller.js";

const router = Router();

router.use(authenticateUser);

router.route("/")
    .get(getAllProjects)
    .post(validateCreateProject, createProject);

router.route("/:projectId")
    .get(validateProjectId, getProject)
    .delete(validateProjectId, deleteProject);

router.patch("/:projectId/rename", validateRenameProject, renameProject);

export default router;
