import { Request, Response, NextFunction } from "express";
import { ValidationError } from "../lib/apiError.js";
import { projectService } from "../services/project.service.js";

function getUserId(req: Request): string {
  const user = req.user as { _id?: unknown } | undefined;
  if (!user?._id) {
    throw new ValidationError("Unauthorized user.");
  }
  return String(user._id);
}

export async function listProjects(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getUserId(req);
    const projects = await projectService.listProjects(userId);

    res.json({ success: true, data: projects });
  } catch (err) {
    next(err);
  }
}

export async function createProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getUserId(req);
    const { name, currentCode = null } = req.body;

    const project = await projectService.createProject(
      userId,
      name,
      currentCode
    );

    res.status(201).json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
}

export async function getProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const project = await projectService.getProjectById(id, userId);

    res.json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
}

export async function updateProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { name, currentCode } = req.body;

    const project = await projectService.updateProject(id, userId, {
      name,
      currentCode,
    });

    res.json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
}

export async function deleteProject(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    await projectService.deleteProject(id, userId);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
