import type { Types } from "mongoose";
import Generation, {
  type GenerationFields,
  type GenerationStatus,
} from "../models/Generation.model.js";

type EntityId = string | Types.ObjectId;

type CreateGenerationInput = {
  projectId: EntityId;
  userId: EntityId;
  prompt: string;
  augmentedPrompt: string;
  isSectionEdit?: boolean;
  sectionId?: string | null;
  sectionHtml?: string | null;
  ragChunksUsed?: number;
};

type CompleteGenerationInput = {
  output: string;
  tokenCount?: number | null;
  durationMs?: number | null;
};

type FailGenerationInput = {
  errorMessage: string;
  durationMs?: number | null;
};

export async function insertOne(input: CreateGenerationInput) {
  const generation = await Generation.create({
    ...input,
    status: "queued",
  });

  return generation.toObject();
}

export async function findRecentByProject(
  projectId: EntityId,
  userId: EntityId,
  limit = 10
) {
  return Generation.find({ projectId, userId, archived: false })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("-augmentedPrompt -sectionHtml")
    .lean();
}

export async function countByProject(projectId: EntityId, userId: EntityId) {
  return Generation.countDocuments({ projectId, userId, archived: false });
}

export async function countByProjectAndStatus(
  projectId: EntityId,
  userId: EntityId,
  status: GenerationStatus
) {
  return Generation.countDocuments({ projectId, userId, status, archived: false });
}

export async function updateStatus(
  generationId: EntityId,
  userId: EntityId,
  status: GenerationStatus
) {
  return Generation.findOneAndUpdate(
    { _id: generationId, userId, archived: false },
    { $set: { status } },
    { new: true, lean: true }
  ).select("-augmentedPrompt -sectionHtml");
}

export async function markDone(
  generationId: EntityId,
  userId: EntityId,
  input: CompleteGenerationInput
) {
  return Generation.findOneAndUpdate(
    { _id: generationId, userId, archived: false },
    {
      $set: {
        ...input,
        status: "done",
        errorMessage: null,
      },
    },
    { new: true, lean: true }
  ).select("-augmentedPrompt -sectionHtml");
}

export async function markFailed(
  generationId: EntityId,
  userId: EntityId,
  input: FailGenerationInput
) {
  return Generation.findOneAndUpdate(
    { _id: generationId, userId, archived: false },
    {
      $set: {
        ...input,
        status: "failed",
      },
    },
    { new: true, lean: true }
  ).select("-augmentedPrompt -sectionHtml");
}

export type GenerationRecord = GenerationFields;