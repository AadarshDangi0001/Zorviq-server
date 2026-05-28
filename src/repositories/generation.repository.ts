import { Types } from "mongoose";
import {
  Generation,
  IGeneration,
  GenerationStatus,
} from "../models/Generation.model.js";
import { logger } from "../lib/logger.js";
 

export interface CreateGenerationDTO {
  projectId: string;
  userId: string;
  prompt: string;
  augmentedPrompt: string;
  isSectionEdit?: boolean;
  sectionId?: string | null;
  sectionHtml?: string | null;
  ragChunksUsed?: number;
}
 
export interface UpdateStatusDTO {
  status: GenerationStatus;
  output?: string;
  tokenCount?: number;
  durationMs?: number;
  errorMessage?: string;
}
 
// ─────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────
export class GenerationRepository {
  /**
   * Create a new generation record (status: queued by default)
   */
  async create(dto: CreateGenerationDTO): Promise<IGeneration> {
    try {
      const gen = await Generation.create({
        projectId: new Types.ObjectId(dto.projectId),
        userId: new Types.ObjectId(dto.userId),
        prompt: dto.prompt,
        augmentedPrompt: dto.augmentedPrompt,
        isSectionEdit: dto.isSectionEdit ?? false,
        sectionId: dto.sectionId ?? null,
        sectionHtml: dto.sectionHtml ?? null,
        ragChunksUsed: dto.ragChunksUsed ?? 0,
      });
 
      logger.info("generation.created", {
        generationId: gen._id.toString(),
        projectId: dto.projectId,
        userId: dto.userId,
        isSectionEdit: dto.isSectionEdit,
        ragChunksUsed: dto.ragChunksUsed,
      });
 
      return gen;
    } catch (err) {
      logger.error("generation.create.failed", { error: err, dto });
      throw err;
    }
  }
 
  /**
   * Update generation status — atomic, uses findByIdAndUpdate (no race conditions)
   */
  async updateStatus(
    generationId: string,
    dto: UpdateStatusDTO
  ): Promise<IGeneration | null> {
    const patch: Partial<IGeneration> = {
      status: dto.status,
    };
 
    if (dto.output !== undefined) patch.output = dto.output;
    if (dto.tokenCount !== undefined) patch.tokenCount = dto.tokenCount;
    if (dto.durationMs !== undefined) patch.durationMs = dto.durationMs;
    if (dto.errorMessage !== undefined) patch.errorMessage = dto.errorMessage;
 
    try {
      const updated = await Generation.findByIdAndUpdate(
        generationId,
        { $set: patch },
        { new: true, runValidators: false }
      ).select("-augmentedPrompt -sectionHtml");
 
      logger.info("generation.status_updated", {
        generationId,
        status: dto.status,
        durationMs: dto.durationMs,
        tokenCount: dto.tokenCount,
      });
 
      return updated;
    } catch (err) {
      logger.error("generation.updateStatus.failed", {
        error: err,
        generationId,
        dto,
      });
      throw err;
    }
  }
 
  /**
   * Get a single generation by ID — validates ownership via userId
   */
  async findById(
    generationId: string,
    userId: string
  ): Promise<IGeneration | null> {
    return Generation.findOne({
      _id: new Types.ObjectId(generationId),
      userId: new Types.ObjectId(userId),
    })
      .select("-augmentedPrompt -sectionHtml")
      .lean()
      .exec();
  }
 
  /**
   * Get the full augmented prompt for a generation (used by worker retry)
   */
  async getAugmentedPrompt(generationId: string): Promise<string | null> {
    const gen = await Generation.findById(generationId)
      .select("augmentedPrompt")
      .lean()
      .exec();
    return gen?.augmentedPrompt ?? null;
  } 
 
  /**
   * Get full output — used when SSE client reconnects after job is done
   */
  async getOutput(generationId: string): Promise<string | null> {
    const gen = await Generation.findById(generationId)
      .select("output status")
      .lean()
      .exec();
    return gen?.output ?? null;
  }
 
  /**
   * Get last N generations for a project (history panel)
   */
  async findRecentByProject(
    projectId: string,
    limit = 10
  ): Promise<IGeneration[]> {
    return Generation.findRecentByProject(projectId, limit);
  }
 
  /**
   * Count active (queued + streaming) generations for a user
   * Used to enforce per-user concurrency limits
   */
  async countActive(userId: string): Promise<number> {
    return Generation.countDocuments({
      userId: new Types.ObjectId(userId),
      status: { $in: ["queued", "streaming"] },
    });
  }
 
  /**
   * Mark old generations as archived (run by a daily cron job)
   * Returns number of records archived
   */
  async archiveOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const result = await Generation.updateMany(
      {
        createdAt: { $lt: cutoff },
        archived: false,
        status: { $in: ["done", "failed"] },
      },
      { $set: { archived: true } }
    );
 
    logger.info("generation.archived", {
      count: result.modifiedCount,
      olderThanDays: days,
    });
 
    return result.modifiedCount;
  }
 
  /**
   * Hard delete all generations for a project (called on project delete)
   */
  async deleteByProject(projectId: string): Promise<void> {
    await Generation.deleteMany({
      projectId: new Types.ObjectId(projectId),
    });
 
    logger.info("generation.deleted_by_project", { projectId });
  }
 
  /**
   * Get stuck streaming jobs (worker crashed mid-stream)
   * Used by a health-check cron to detect and fail orphaned jobs
   */
  async findStuck(stuckAfterMinutes = 5): Promise<IGeneration[]> {
    const cutoff = new Date(Date.now() - stuckAfterMinutes * 60_000);
    return Generation.find({
      status: "streaming",
      updatedAt: { $lt: cutoff },
    })
      .select("_id projectId userId")
      .lean()
      .exec();
  }
}
 
// Singleton export
export const generationRepository = new GenerationRepository();
 