import { NotFoundError, ValidationError } from "../lib/apiError.js";
import { generationRepository } from "../repositories/generation.repository.js";
import { projectRepository } from "../repositories/project.repository.js";
import {
  CACHE_KEYS,
  CACHE_TTL_SECONDS,
  cacheService,
} from "./cache.service.js";

export class ProjectService {
  async listProjects(userId: string) {
    const cacheKey = CACHE_KEYS.projectList(userId);
    const cached = await cacheService.get<
      Awaited<ReturnType<typeof projectRepository.findAllByUser>>
    >(cacheKey);

    if (cached) return cached;

    const projects = await projectRepository.findAllByUser(userId);
    await cacheService.set(cacheKey, projects, CACHE_TTL_SECONDS.projectList);
    return projects;
  }

  async createProject(
    userId: string,
    name: string,
    currentCode: string | null = null
  ) {
    if (!name || name.trim().length < 3) {
      throw new ValidationError("Project name must be at least 3 characters.");
    }

    const project = await projectRepository.create(userId, name.trim(), currentCode);
    await this.invalidateProjectCache(userId);
    return project;
  }

  async getProjectById(projectId: string, userId: string) {
    const cacheKey = CACHE_KEYS.projectDetail(userId, projectId);
    const cached = await cacheService.get<
      Awaited<ReturnType<typeof projectRepository.findById>>
    >(cacheKey);

    if (cached) return cached;

    const project = await projectRepository.findById(projectId, userId);
    if (!project) {
      throw new NotFoundError("Project not found.");
    }

    await cacheService.set(cacheKey, project, CACHE_TTL_SECONDS.projectDetail);
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

    await this.invalidateProjectCache(userId, projectId);
    return updated;
  }

  async deleteProject(projectId: string, userId: string) {
    const deleted = await projectRepository.delete(projectId, userId);
    if (!deleted) {
      throw new NotFoundError("Project not found.");
    }
    await generationRepository.deleteByProject(projectId);
    await this.invalidateProjectCache(userId, projectId);
    return deleted;
  }

  async invalidateProjectCache(userId: string, projectId?: string) {
    await cacheService.del(
      CACHE_KEYS.projectList(userId),
      ...(projectId ? [CACHE_KEYS.projectDetail(userId, projectId)] : [])
    );
  }
}

export const projectService = new ProjectService();
