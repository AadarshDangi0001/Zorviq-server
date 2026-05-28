import { Types } from "mongoose";
import { Project, type IProject } from "../models/Project.model.js";

export class ProjectRepository {
  async findAllByUser(userId: string): Promise<IProject[]> {
    return Project.find({
      userId: new Types.ObjectId(userId),
    })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async create(
    userId: string,
    name: string,
    currentCode: string | null = null
  ): Promise<IProject> {
    return Project.create({
      userId: new Types.ObjectId(userId),
      name,
      currentCode,
    });
  }

  async findById(projectId: string, userId: string): Promise<IProject | null> {
    return Project.findOne({
      _id: new Types.ObjectId(projectId),
      userId: new Types.ObjectId(userId),
    }).exec();
  }

  async update(
    projectId: string,
    userId: string,
    data: Partial<Pick<IProject, "name" | "currentCode">>
  ): Promise<IProject | null> {
    return Project.findOneAndUpdate(
      {
        _id: new Types.ObjectId(projectId),
        userId: new Types.ObjectId(userId),
      },
      { $set: data },
      {
        new: true,
      }
    ).exec();
  }

  async delete(projectId: string, userId: string): Promise<boolean> {
    const result = await Project.deleteOne({
      _id: new Types.ObjectId(projectId),
      userId: new Types.ObjectId(userId),
    }).exec();

    return result.deletedCount === 1;
  }

  async findOne(projectId: string, userId: string): Promise<IProject | null> {
    return Project.findOne({
      _id: new Types.ObjectId(projectId),
      userId: new Types.ObjectId(userId),
    })
      .lean()
      .exec();
  }

  async updateCode(projectId: string, userId: string, currentCode: string): Promise<void> {
    await Project.updateOne(
      {
        _id: new Types.ObjectId(projectId),
        userId: new Types.ObjectId(userId),
      },
      { $set: { currentCode } }
    ).exec();
  }
}

export const projectRepository = new ProjectRepository();
