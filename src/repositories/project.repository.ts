import type { Types } from "mongoose";
import Project from "../models/Project.model.js";

type EntityId = string | Types.ObjectId;
type NameLookupOptions = {
    excludeProjectId?: EntityId;
};

class ProjectRepository {
    findAllByUser(userId: EntityId) {
        return Project.find(
            { userId, isDeleted: false },
            { name: 1, createdAt: 1, updatedAt: 1 }
        )
            .sort({ updatedAt: -1 })
            .lean();
    }

    findOne(projectId: EntityId, userId: EntityId) {
        return Project.findOne({
            _id: projectId,
            userId,
            isDeleted: false,
        }).lean();
    }

    findActiveByName(
        userId: EntityId,
        name: string,
        options: NameLookupOptions = {}
    ) {
        return Project.findOne({
            userId,
            name,
            isDeleted: false,
            ...(options.excludeProjectId
                ? { _id: { $ne: options.excludeProjectId } }
                : {}),
        })
            .collation({ locale: "en", strength: 2 })
            .lean();
    }

    create(userId: EntityId, name: string) {
        return Project.create({ userId, name });
    }

    async insertOne(userId: EntityId, name: string) {
        const project = await this.create(userId, name);
        return project.toObject();
    }

    updateName(projectId: EntityId, userId: EntityId, newName: string) {
        return Project.findOneAndUpdate(
            { _id: projectId, userId, isDeleted: false },
            { $set: { name: newName } },
            { new: true, lean: true, projection: { name: 1, updatedAt: 1 } }
        );
    }

    updateCode(projectId: EntityId, userId: EntityId, code: string) {
        return Project.findOneAndUpdate(
            { _id: projectId, userId, isDeleted: false },
            { $set: { currentCode: code } },
            { new: true, lean: true, projection: { currentCode: 1, updatedAt: 1 } }
        );
    }

    softDelete(projectId: EntityId, userId: EntityId) {
        return Project.findOneAndUpdate(
            { _id: projectId, userId, isDeleted: false },
            { $set: { isDeleted: true } },
            { new: true, lean: true, projection: { _id: 1 } }
        );
    }

    async softDeleteAllByUser(userId: EntityId) {
        const result = await Project.updateMany(
            { userId, isDeleted: false },
            { $set: { isDeleted: true } }
        );

        return { deletedCount: result.modifiedCount };
    }

    countByUser(userId: EntityId) {
        return Project.countDocuments({ userId, isDeleted: false });
    }
}

export const projectRepository = new ProjectRepository();
