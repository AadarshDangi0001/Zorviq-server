import type { Types } from "mongoose";
import { ApiError } from "../lib/apiError.js";
import { delCache, getCache, setCache } from "./cache.service.js";
import * as repo from "../repositories/project.repository.js";
import * as generationRepo from "../repositories/generation.repository.js";

type EntityId = string | Types.ObjectId;

const TTL = {
    PROJECT: 5 * 60,
    LIST: 30,
};

const cacheKey = {
    project: (id: EntityId) => `project:${id.toString()}`,
    list: (userId: EntityId) => `user:projects:${userId.toString()}`,
};

export async function getAllProjects(userId: EntityId) {
    const cached = await getCache(cacheKey.list(userId));
    if (cached) return cached;

    const [projects, totalProjects] = await Promise.all([
        repo.findAllByUser(userId),
        repo.countByUser(userId),
    ]);
    const result = { projects, totalProjects };

    await setCache(cacheKey.list(userId), result, TTL.LIST);
    return result;
}

export async function createProject(userId: EntityId, name?: string) {
    const project = await repo.insertOne(userId, name || "Untitled Project");
    const totalProjects = await repo.countByUser(userId);

    await delCache(cacheKey.list(userId));
    return { project, totalProjects };
}

export async function getProject(projectId: EntityId, userId: EntityId) {
    const cached = await getCache<{ userId: EntityId }>(cacheKey.project(projectId));

    let project = cached;
    if (cached) {
        if (String(cached.userId) !== String(userId)) {
            throw new ApiError(403, "Access denied");
        }
    } else {
        project = await repo.findByIdAndOwner(projectId, userId);
        if (!project) throw new ApiError(404, "Project not found");

        await setCache(cacheKey.project(projectId), project, TTL.PROJECT);
    }

    const [
        totalGenerations,
        completedGenerations,
        failedGenerations,
        recentGenerations,
    ] = await Promise.all([
        generationRepo.countByProject(projectId, userId),
        generationRepo.countByProjectAndStatus(projectId, userId, "done"),
        generationRepo.countByProjectAndStatus(projectId, userId, "failed"),
        generationRepo.findRecentByProject(projectId, userId, 5),
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

export async function renameProject(projectId: EntityId, userId: EntityId, newName: string) {
    const project = await repo.updateName(projectId, userId, newName);
    if (!project) throw new ApiError(404, "Project not found");

    await delCache(cacheKey.project(projectId), cacheKey.list(userId));
    return project;
}

export async function deleteProject(projectId: EntityId, userId: EntityId) {
    const deleted = await repo.softDelete(projectId, userId);
    if (!deleted) throw new ApiError(404, "Project not found");

    const totalProjects = await repo.countByUser(userId);

    await delCache(cacheKey.project(projectId), cacheKey.list(userId));
    return { deleted: true, projectId, totalProjects };
}
