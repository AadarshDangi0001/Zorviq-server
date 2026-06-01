import type { Types } from "mongoose";
import Project from "../models/Project.model.js";

type EntityId = string | Types.ObjectId;

export async function findAllByUser(userId: EntityId) {
    return Project.find(
        { userId, isDeleted: false },
        { name: 1, createdAt: 1, updatedAt: 1 }
    )
        .sort({ updatedAt: -1 })
        .lean();
}

export async function findByIdAndOwner(projectId: EntityId, userId: EntityId) {
    return Project.findOne(
        { _id: projectId, userId, isDeleted: false }
    ).lean();
}

export async function insertOne(userId: EntityId, name: string) {
    const project = await Project.create({ userId, name });
    return project.toObject();
}

export async function updateName(projectId: EntityId, userId: EntityId, newName: string) {
    return Project.findOneAndUpdate(
        { _id: projectId, userId, isDeleted: false },
        { $set: { name: newName } },
        { new: true, lean: true, projection: { name: 1, updatedAt: 1 } }
    );
}

export async function updateCode(projectId: EntityId, userId: EntityId, code: string) {
    return Project.findOneAndUpdate(
        { _id: projectId, userId, isDeleted: false },
        { $set: { currentCode: code } },
        { new: true, lean: true, projection: { currentCode: 1, updatedAt: 1 } }
    );
}

export async function softDelete(projectId: EntityId, userId: EntityId) {
    return Project.findOneAndUpdate(
        { _id: projectId, userId, isDeleted: false },
        { $set: { isDeleted: true } },
        { new: true, lean: true, projection: { _id: 1 } }
    );
}

export async function softDeleteAllByUser(userId: EntityId) {
    const result = await Project.updateMany(
        { userId, isDeleted: false },
        { $set: { isDeleted: true } }
    );
    return { deletedCount: result.modifiedCount };
}

export async function countByUser(userId: EntityId) {
    return Project.countDocuments({ userId, isDeleted: false });
}
