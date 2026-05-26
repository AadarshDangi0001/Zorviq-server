import { Types } from "mongoose";
import { Project, type IProject } from "../models/Project.model.js";

export class ProjectRepository {
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
