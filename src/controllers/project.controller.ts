import type { Request } from "express";
import type { UserDocument } from "../models/User.model.js";
import { ApiError } from "../lib/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import * as projectService from "../services/project.service.js";

type ProjectIdParams = {
    projectId: string;
};

type ProjectNameBody = {
    name?: string;
};

type RenameProjectBody = {
    name: string;
};

const getAuthenticatedUserId = (req: Request) => {
    const user = req.user as UserDocument | undefined;
    if (!user?._id) throw new ApiError(401, "Unauthorized");

    return user._id;
};

export const getAllProjects = asyncHandler(async (req, res) => {
    const result = await projectService.getAllProjects(getAuthenticatedUserId(req));
    res.status(200).json({ message: "Projects fetched", success: true, ...result });
});

export const createProject = asyncHandler<Record<string, never>, unknown, ProjectNameBody>(async (req, res) => {
    const result = await projectService.createProject(getAuthenticatedUserId(req), req.body.name);
    res.status(201).json({ message: "Project created", success: true, ...result });
});

export const getProject = asyncHandler<ProjectIdParams>(async (req, res) => {
    const project = await projectService.getProject(req.params.projectId, getAuthenticatedUserId(req));
    res.status(200).json({ message: "Project fetched", success: true, project });
});

export const renameProject = asyncHandler<ProjectIdParams, unknown, RenameProjectBody>(async (req, res) => {
    const project = await projectService.renameProject(
        req.params.projectId,
        getAuthenticatedUserId(req),
        req.body.name
    );
    res.status(200).json({ message: "Project renamed", success: true, project });
});

export const deleteProject = asyncHandler<ProjectIdParams>(async (req, res) => {
    const result = await projectService.deleteProject(req.params.projectId, getAuthenticatedUserId(req));
    res.status(200).json({ message: "Project deleted", success: true, ...result });
});
