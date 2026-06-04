import type { Request, Response, NextFunction } from 'express';
import { exportProject } from '../services/export.service.js';
import { getAuthenticatedUserId } from '../utils/requestUser.js';

export async function downloadProjectZip(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const { projectId } = req.params;
    const { buffer, fileName } = await exportProject(projectId, userId);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.byteLength.toString());
    res.status(200).send(buffer);
  } catch (err) {
    next(err);
  }
}
