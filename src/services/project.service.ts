import { NotFoundError, ValidationError } from '../lib/apiError.js';
import { generationRepository } from '../repositories/generation.repository.js';
import { projectRepository } from '../repositories/project.repository.js';
import { CACHE_KEYS, CACHE_TTL_SECONDS, cacheService } from './cache.service.js';

export class ProjectService {
  /**
   * Lists projects owned by a user, preferring the short-lived project list cache.
   *
   * @returns Projects sorted by most recently updated.
   */
  async listProjects(userId: string) {
    const cacheKey = CACHE_KEYS.projectList(userId);
    const cached =
      await cacheService.get<Awaited<ReturnType<typeof projectRepository.findAllByUser>>>(cacheKey);

    if (cached) return cached;

    const projects = await projectRepository.findAllByUser(userId);
    await cacheService.set(cacheKey, projects, CACHE_TTL_SECONDS.projectList);
    return projects;
  }

  /**
   * Creates a project for the user after validating the display name.
   *
   * @sideEffects Writes a project document and invalidates the user's project list cache.
   */
  async createProject(userId: string, name: string, currentCode: string | null = null) {
    if (!name || name.trim().length < 3) {
      throw new ValidationError('Project name must be at least 3 characters.');
    }

    const project = await projectRepository.create(userId, name.trim(), currentCode);
    await this.invalidateProjectCache(userId);
    return project;
  }

  /**
   * Fetches one project by ID while enforcing user ownership.
   *
   * @throws NotFoundError when the project does not exist for the user.
   */
  async getProjectById(projectId: string, userId: string) {
    const cacheKey = CACHE_KEYS.projectDetail(userId, projectId);
    const cached =
      await cacheService.get<Awaited<ReturnType<typeof projectRepository.findById>>>(cacheKey);

    if (cached) return cached;

    const project = await projectRepository.findById(projectId, userId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }

    await cacheService.set(cacheKey, project, CACHE_TTL_SECONDS.projectDetail);
    return project;
  }

  /**
   * Updates mutable project fields while enforcing user ownership.
   *
   * @sideEffects Invalidates project list and detail cache entries.
   */
  async updateProject(
    projectId: string,
    userId: string,
    data: Partial<{ name: string; currentCode: string | null }>
  ) {
    if (data.name && data.name.trim().length < 3) {
      throw new ValidationError('Project name must be at least 3 characters.');
    }

    const updated = await projectRepository.update(projectId, userId, {
      ...(data.name ? { name: data.name.trim() } : {}),
      currentCode: data.currentCode,
    });

    if (!updated) {
      throw new NotFoundError('Project not found.');
    }

    await this.invalidateProjectCache(userId, projectId);
    return updated;
  }

  /**
   * Deletes a project and its generation history for the owning user.
   *
   * @sideEffects Removes project and generation documents and invalidates project cache.
   */
  async deleteProject(projectId: string, userId: string) {
    const deleted = await projectRepository.delete(projectId, userId);
    if (!deleted) {
      throw new NotFoundError('Project not found.');
    }
    await generationRepository.deleteByProject(projectId);
    await this.invalidateProjectCache(userId, projectId);
    return deleted;
  }

  /**
   * Clears cached project list and, when provided, a specific project detail entry.
   */
  async invalidateProjectCache(userId: string, projectId?: string) {
    await cacheService.del(
      CACHE_KEYS.projectList(userId),
      ...(projectId ? [CACHE_KEYS.projectDetail(userId, projectId)] : [])
    );
  }
}

export const projectService = new ProjectService();
