import type { Types } from "mongoose";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/apiError.js";
import { generationRepository } from "../repositories/generation.repository.js";
import { projectRepository } from "../repositories/project.repository.js";
import { delCache, getCache, setCache } from "./cache.service.js";

type EntityId = string | Types.ObjectId;

const TTL = {
    PROJECT: 5 * 60,
    LIST: 30,
};

const cacheKey = {
    project: (id: EntityId) => `project:${id.toString()}`,
    list: (userId: EntityId) => `user:projects:${userId.toString()}`,
};

const isDuplicateProjectNameError = (error: unknown) => {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
    );
};

class ProjectService {
    async getAllProjects(userId: EntityId) {
        const cached = await getCache(cacheKey.list(userId));
        if (cached) return cached;

        const [projects, totalProjects] = await Promise.all([
            projectRepository.findAllByUser(userId),
            projectRepository.countByUser(userId),
        ]);
        const result = { projects, totalProjects };

        await setCache(cacheKey.list(userId), result, TTL.LIST);
        return result;
    }

    async createProject(userId: EntityId, name?: string) {
        const projectName = name?.trim() || "Untitled Project";
        const existingProject = await projectRepository.findActiveByName(
            userId,
            projectName
        );

        if (existingProject) {
            throw new ConflictError("Project name already exists");
        }

        let project;
        try {
            project = await projectRepository.insertOne(userId, projectName);
        } catch (error) {
            if (isDuplicateProjectNameError(error)) {
                throw new ConflictError("Project name already exists");
            }

            throw error;
        }

        const totalProjects = await projectRepository.countByUser(userId);

        await delCache(cacheKey.list(userId));
        return { project, totalProjects };
    }

    async getProject(projectId: EntityId, userId: EntityId) {
        const cached = await getCache<{ userId: EntityId }>(cacheKey.project(projectId));

        let project = cached;
        if (cached) {
            if (String(cached.userId) !== String(userId)) {
                throw new ForbiddenError("Access denied");
            }
        } else {
            project = await projectRepository.findOne(projectId, userId);
            if (!project) throw new NotFoundError("Project not found");

            await setCache(cacheKey.project(projectId), project, TTL.PROJECT);
        }

        const [
            totalGenerations,
            completedGenerations,
            failedGenerations,
            recentGenerations,
        ] = await Promise.all([
            generationRepository.countByProject(projectId, userId),
            generationRepository.countByProjectAndStatus(projectId, userId, "done"),
            generationRepository.countByProjectAndStatus(projectId, userId, "failed"),
            generationRepository.findRecentByProjectForUser(projectId, userId, 5),
        ]);

        return {
            ...project,
            generationSummary: {
                totalGenerations,
                completedGenerations,
                failedGenerations,
                recentGenerations,
            },
        };
    }

    async renameProject(projectId: EntityId, userId: EntityId, newName: string) {
        const projectName = newName.trim();
        const existingProject = await projectRepository.findActiveByName(
            userId,
            projectName,
            { excludeProjectId: projectId }
        );

        if (existingProject) {
            throw new ConflictError("Project name already exists");
        }

        let project;
        try {
            project = await projectRepository.updateName(projectId, userId, projectName);
        } catch (error) {
            if (isDuplicateProjectNameError(error)) {
                throw new ConflictError("Project name already exists");
            }

            throw error;
        }

        if (!project) throw new NotFoundError("Project not found");

        await delCache(cacheKey.project(projectId), cacheKey.list(userId));
        return project;
    }

    async deleteProject(projectId: EntityId, userId: EntityId) {
        const deleted = await projectRepository.softDelete(projectId, userId);
        if (!deleted) throw new NotFoundError("Project not found");

        const totalProjects = await projectRepository.countByUser(userId);

        await delCache(cacheKey.project(projectId), cacheKey.list(userId));
        return { deleted: true, projectId, totalProjects };
    }
}

export const projectService = new ProjectService();
