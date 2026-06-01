import type { Request } from "express";
import type { UserDocument } from "../models/User.model.js";
import { UnauthorizedError } from "../lib/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { projectService } from "../services/project.service.js";

type ProjectIdParams = {
  projectId: string;
};

type ProjectNameBody = {
  name?: string;
};

type RenameProjectBody = {
  name: string;
};

class ProjectController {
  private getAuthenticatedUserId(req: Request) {
    const user = req.user as UserDocument | undefined;
    if (!user?._id) throw new UnauthorizedError();

    return user._id;
  }

  getAllProjects = asyncHandler(async (req, res) => {
    const result = await projectService.getAllProjects(
      this.getAuthenticatedUserId(req)
    );

    res.status(200).json({ message: "Projects fetched", success: true, ...result });
  });

  createProject = asyncHandler<Record<string, never>, unknown, ProjectNameBody>(
    async (req, res) => {
      const result = await projectService.createProject(
        this.getAuthenticatedUserId(req),
        req.body.name
      );

      res.status(201).json({ message: "Project created", success: true, ...result });
    }
  );

  getProject = asyncHandler<ProjectIdParams>(async (req, res) => {
    const project = await projectService.getProject(
      req.params.projectId,
      this.getAuthenticatedUserId(req)
    );

    res.status(200).json({ message: "Project fetched", success: true, project });
  });

  renameProject = asyncHandler<ProjectIdParams, unknown, RenameProjectBody>(
    async (req, res) => {
      const project = await projectService.renameProject(
        req.params.projectId,
        this.getAuthenticatedUserId(req),
        req.body.name
      );

      res.status(200).json({ message: "Project renamed", success: true, project });
    }
  );

  deleteProject = asyncHandler<ProjectIdParams>(async (req, res) => {
    const result = await projectService.deleteProject(
      req.params.projectId,
      this.getAuthenticatedUserId(req)
    );

    res.status(200).json({ message: "Project deleted", success: true, ...result });
  });
}

export const projectController = new ProjectController();
