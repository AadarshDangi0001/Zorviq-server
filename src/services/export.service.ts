import { ValidationError } from '../lib/apiError.js';
import { buildProjectZip } from '../lib/zipBuilder.js';
import { projectService } from './project.service.js';

/**
 * Builds a ZIP archive for a user-owned project with generated code.
 *
 * @returns ZIP buffer and a safe download filename.
 * @throws ValidationError when the project has no generated code.
 */
export async function exportProject(
  projectId: string,
  userId: string
): Promise<{
  buffer: Buffer;
  fileName: string;
}> {
  const project = await projectService.getProjectById(projectId, userId);
  const currentCode = project.currentCode?.trim();

  if (!currentCode) {
    throw new ValidationError('Project has no generated code to export.');
  }

  return buildProjectZip({
    projectName: project.name,
    currentCode,
  });
}
