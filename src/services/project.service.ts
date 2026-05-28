import { NotFoundError, ValidationError } from "../lib/apiError.js";
import { projectRepository } from "../repositories/project.repository.js";

export class ProjectService {
  async listProjects(userId: string) {
    return projectRepository.findAllByUser(userId);
  }

  async createProject(
    userId: string,
    name: string,
    currentCode: string | null = null
  ) {
    if (!name || name.trim().length < 3) {
      throw new ValidationError("Project name must be at least 3 characters.");
    }

    return projectRepository.create(userId, name.trim(), currentCode);
  }

  async getProjectById(projectId: string, userId: string) {
    const project = await projectRepository.findById(projectId, userId);
    if (!project) {
      throw new NotFoundError("Project not found.");
    }
    return project;
  }

  async updateProject(
    projectId: string,
    userId: string,
    data: Partial<{ name: string; currentCode: string | null }>
  ) {
    if (data.name && data.name.trim().length < 3) {
      throw new ValidationError("Project name must be at least 3 characters.");
    }

    const updated = await projectRepository.update(projectId, userId, {
      ...(data.name ? { name: data.name.trim() } : {}),
      currentCode: data.currentCode,
    });

    if (!updated) {
      throw new NotFoundError("Project not found.");
    }

    return updated;
  }

  async deleteProject(projectId: string, userId: string) {
    const deleted = await projectRepository.delete(projectId, userId);
    if (!deleted) {
      throw new NotFoundError("Project not found.");
    }
    return deleted;
  }
}

export const projectService = new ProjectService();
