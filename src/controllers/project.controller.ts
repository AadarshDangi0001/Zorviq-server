import type { Request, Response, NextFunction } from 'express';
import { projectService } from '../services/project.service.js';
import { getAuthenticatedUserId } from '../utils/requestUser.js';

export async function listProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
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
    const userId = getAuthenticatedUserId(req);
    const { name, currentCode = null } = req.body;

    const project = await projectService.createProject(userId, name, currentCode);

    res.status(201).json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
}

export async function getProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
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
    const userId = getAuthenticatedUserId(req);
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
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    await projectService.deleteProject(id, userId);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
