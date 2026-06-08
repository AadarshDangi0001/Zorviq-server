import { Types } from 'mongoose';
import type { IGeneration, GenerationStatus } from '../models/Generation.model.js';
import { Generation } from '../models/Generation.model.js';
import { logger } from '../lib/logger.js';
import type { GenerationMemoryRecord } from '../services/projectMemory.service.js';

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

      logger.info('generation.created', {
        generationId: gen._id.toString(),
        projectId: dto.projectId,
        userId: dto.userId,
        isSectionEdit: dto.isSectionEdit,
        ragChunksUsed: dto.ragChunksUsed,
      });

      return gen;
    } catch (err) {
      logger.error('generation.create.failed', { error: err, dto });
      throw err;
    }
  }

  /**
   * Update generation status — atomic, uses findByIdAndUpdate (no race conditions)
   */
  async updateStatus(generationId: string, dto: UpdateStatusDTO): Promise<IGeneration | null> {
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
      ).select('-augmentedPrompt -sectionHtml');

      logger.info('generation.status_updated', {
        generationId,
        status: dto.status,
        durationMs: dto.durationMs,
        tokenCount: dto.tokenCount,
      });

      return updated;
    } catch (err) {
      logger.error('generation.updateStatus.failed', {
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
  async findById(generationId: string, userId: string): Promise<IGeneration | null> {
    return Generation.findOne({
      _id: new Types.ObjectId(generationId),
      userId: new Types.ObjectId(userId),
    })
      .select('-augmentedPrompt -sectionHtml')
      .lean()
      .exec();
  }

  /**
   * Get full output — used when SSE client reconnects after job is done
   */
  async getOutput(generationId: string, userId: string): Promise<string | null> {
    const gen = await Generation.findOne({
      _id: new Types.ObjectId(generationId),
      userId: new Types.ObjectId(userId),
    })
      .select('output status')
      .lean()
      .exec();
    return gen?.output ?? null;
  }

  /**
   * Get last N generations for a project (history panel)
   */
  async findRecentByProject(projectId: string, limit = 10): Promise<IGeneration[]> {
    return Generation.findRecentByProject(projectId, limit);
  }

  async findMemoryByProject(
    projectId: string,
    userId: string,
    limit = 6
  ): Promise<GenerationMemoryRecord[]> {
    return Generation.find({
      projectId: new Types.ObjectId(projectId),
      userId: new Types.ObjectId(userId),
      archived: false,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('prompt output status isSectionEdit sectionId createdAt updatedAt')
      .lean<GenerationMemoryRecord[]>()
      .exec();
  }

  /**
   * Count active (queued + streaming) generations for a user
   * Used to enforce per-user concurrency limits
   */
  async countActive(userId: string): Promise<number> {
    return Generation.countDocuments({
      userId: new Types.ObjectId(userId),
      status: { $in: ['queued', 'streaming'] },
    });
  }

  async failStaleActiveForUser(userId: string, staleAfterMinutes = 10): Promise<number> {
    const cutoff = new Date(Date.now() - staleAfterMinutes * 60_000);
    const result = await Generation.updateMany(
      {
        userId: new Types.ObjectId(userId),
        status: { $in: ['queued', 'streaming'] },
        updatedAt: { $lt: cutoff },
      },
      {
        $set: {
          status: 'failed',
          errorMessage: 'Generation expired before completion. Please try again.',
        },
      }
    );

    if (result.modifiedCount > 0) {
      logger.warn('generation.stale_active_failed', {
        userId,
        count: result.modifiedCount,
      });
    }

    return result.modifiedCount;
  }

  /**
   * Hard delete all generations for a project (called on project delete)
   */
  async deleteByProject(projectId: string): Promise<void> {
    await Generation.deleteMany({
      projectId: new Types.ObjectId(projectId),
    });

    logger.info('generation.deleted_by_project', { projectId });
  }
}

// Singleton export
export const generationRepository = new GenerationRepository();
