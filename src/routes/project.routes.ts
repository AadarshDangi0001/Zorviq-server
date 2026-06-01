import { Router } from "express";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { validateProjectId, validateCreateProject, validateRenameProject } from "../middleware/validators/project.validator.js";
import { projectController } from "../controllers/project.controller.js";

const router = Router();

router.use(authenticateUser);

router.route("/")
    .get(projectController.getAllProjects)
    .post(validateCreateProject, projectController.createProject);

router.route("/:projectId")
    .get(validateProjectId, projectController.getProject)
    .delete(validateProjectId, projectController.deleteProject);

router.patch("/:projectId/rename", validateRenameProject, projectController.renameProject);

export default router;
