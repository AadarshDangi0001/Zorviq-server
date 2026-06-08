import { redis } from '../config/redis.js';
import { generationRepository } from '../repositories/generation.repository.js';
import { projectRepository } from '../repositories/project.repository.js';
import {
  enqueueGeneration,
  buildPromptCacheKey,
  buildRequestHash,
  getQueueHealth,
  REDIS_KEYS,
  CACHE_TTL,
  type GenerationJobData,
} from '../queue/generation.queue.js';
import { ragService, type RagService } from './rag.service.js';
import { rateLimiterService, type RateLimiterService } from './rateLimiter.service.js';
import { CACHE_KEYS, cacheService } from './cache.service.js';
import { buildProjectMemoryContext, projectMemoryService } from './projectMemory.service.js';
import { logger } from '../lib/logger.js';
import {
  NotFoundError,
  RateLimitError,
  ValidationError,
  ServiceUnavailableError,
} from '../lib/apiError.js';
import type { IGeneration } from '../models/Generation.model.js';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export interface EnqueueOptions {
  isSectionEdit?: boolean;
  sectionId?: string | null;
  sectionHtml?: string | null;
}

export interface EnqueueResult {
  jobId: string;
  status: 'queued' | 'done'; // 'done' when served from cache
  cached: boolean;
  code?: string; // only present when cached = true
  queuePosition?: number; // only when queued
  estimatedWaitSeconds?: number;
}

// ─────────────────────────────────────────────
// Generation Service
// ─────────────────────────────────────────────
export class GenerationService {
  // Rough estimate: average generation takes ~12 seconds
  private readonly avgGenSeconds = 12;
  // Max concurrent active generations per user
  private readonly maxActivePerUser = 2;

  constructor(
    private rag: RagService,
    private rateLimiter: RateLimiterService
  ) {}

  /**
   * Validates and schedules a generation request for a user-owned project.
   *
   * @returns A completed cached response or queued job metadata.
   * @sideEffects Reads and writes Redis, creates generation records, and may update project code on cache hit.
   */
  async enqueue(
    userId: string,
    projectId: string,
    prompt: string,
    opts: EnqueueOptions = {}
  ): Promise<EnqueueResult> {
    const { isSectionEdit = false, sectionId = null, sectionHtml = null } = opts;

    // ── 1. Validate input ───────────────────────────────────────────────
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || trimmedPrompt.length < 5) {
      throw new ValidationError('Prompt must be at least 5 characters.');
    }
    if (trimmedPrompt.length > 2000) {
      throw new ValidationError('Prompt must not exceed 2000 characters.');
    }
    if (isSectionEdit && !sectionId) {
      throw new ValidationError('sectionId is required for section edit requests.');
    }

    // ── 2. Verify project belongs to user ───────────────────────────────
    const project = await projectRepository.findOne(projectId, userId);
    if (!project) {
      throw new NotFoundError('Project not found.');
    }

    // ── 3. Rate limit check ─────────────────────────────────────────────
    await this.rateLimiter.check(userId);

    // ── 4. Check per-user active generation limit ───────────────────────
    await generationRepository.failStaleActiveForUser(userId);
    const activeCount = await generationRepository.countActive(userId);
    if (activeCount >= this.maxActivePerUser) {
      throw new RateLimitError(
        `You already have ${activeCount} active generation(s). Please wait for them to complete.`
      );
    }

    // ── 5. Queue capacity check ─────────────────────────────────────────
    const queueHealth = getQueueHealth();
    if (!queueHealth.isHealthy) {
      throw new ServiceUnavailableError('Server is under high load. Please try again in a moment.');
    }

    // ── 6. Prompt cache check ────────────────────────────────────────────
    const cacheScope = {
      userId,
      projectId,
      currentCode: project.currentCode ?? null,
      sectionHtml,
      memorySignature: null as string | null,
    };

    const recentMemoryRecords = await generationRepository.findMemoryByProject(projectId, userId);
    const memoryQueryText = [
      trimmedPrompt,
      project.currentCode ?? '',
      ...recentMemoryRecords.map((record) => record.prompt),
    ]
      .filter(Boolean)
      .join('\n');
    const semanticMemories = await projectMemoryService.retrieveRelevantMemories(
      userId,
      projectId,
      memoryQueryText
    );
    const memory = buildProjectMemoryContext({
      currentCode: project.currentCode ?? null,
      recentGenerations: recentMemoryRecords,
      semanticMemories,
    });
    cacheScope.memorySignature = memory.signature;

    const requestHash = buildRequestHash(trimmedPrompt, isSectionEdit, sectionId, cacheScope);
    const cacheKey = buildPromptCacheKey(trimmedPrompt, isSectionEdit, sectionId, cacheScope);
    const cachedOutput = await redis.get(cacheKey);

    if (cachedOutput) {
      logger.info('generation.cache_hit', {
        userId,
        projectId,
        requestHash,
        cacheKey,
        outputLength: cachedOutput.length,
      });

      // Create a generation record (for history) and immediately mark done
      const gen = await generationRepository.create({
        projectId,
        userId,
        prompt: trimmedPrompt,
        augmentedPrompt: this.buildPromptWithMemory(trimmedPrompt, memory.context),
        isSectionEdit,
        sectionId,
        sectionHtml,
        ragChunksUsed: 0,
      });

      await Promise.all([
        generationRepository.updateStatus(gen._id.toString(), {
          status: 'done',
          output: cachedOutput,
          durationMs: 0,
        }),
        projectRepository.updateCode(projectId, userId, cachedOutput),
        cacheService.del(
          CACHE_KEYS.projectList(userId),
          CACHE_KEYS.projectDetail(userId, projectId)
        ),
        // Mark job status in Redis so SSE clients don't hang
        redis.set(REDIS_KEYS.jobStatus(gen._id.toString()), 'done', 'EX', CACHE_TTL.job),
      ]);

      await projectMemoryService
        .rememberGeneration({
          generationId: gen._id.toString(),
          userId,
          projectId,
          prompt: trimmedPrompt,
          output: cachedOutput,
          isSectionEdit,
          sectionId,
        })
        .catch((memoryErr) => {
          logger.warn('generation.cached_memory_upsert_failed', {
            generationId: gen._id.toString(),
            projectId,
            error: memoryErr,
          });
        });

      return {
        jobId: gen._id.toString(),
        status: 'done',
        cached: true,
        code: cachedOutput,
      };
    }

    logger.info('generation.cache_miss', {
      userId,
      projectId,
      requestHash,
      cacheKey,
    });

    // ── 7. RAG retrieval — fetch similar components ──────────────────────
    let augmentedPrompt: string;
    let ragChunksUsed = 0;
    const promptWithMemory = this.buildPromptWithMemory(trimmedPrompt, memory.context);
    const retrievalQuery = [trimmedPrompt, memory.searchText].filter(Boolean).join('\n');

    try {
      const chunks = await this.rag.retrieveComponents(retrievalQuery);
      ragChunksUsed = chunks.length;
      augmentedPrompt = this.rag.buildAugmentedPrompt(promptWithMemory, chunks);

      // For section edits: prepend the current section HTML
      if (isSectionEdit && sectionHtml) {
        augmentedPrompt = this.buildSectionEditPrompt(sectionHtml, augmentedPrompt);
      }

      logger.info('generation.rag_complete', {
        userId,
        promptLength: trimmedPrompt.length,
        ragChunks: ragChunksUsed,
        memoryRecentTurns: memory.recentCount,
        memorySemanticTurns: memory.semanticCount,
        memoryCurrentCodeIncluded: memory.currentCodeIncluded,
        augmentedLength: augmentedPrompt.length,
      });
    } catch (ragErr) {
      // RAG failure is non-fatal — fall back to plain prompt
      logger.warn('generation.rag_failed', {
        error: ragErr,
        userId,
        projectId,
      });
      augmentedPrompt =
        isSectionEdit && sectionHtml
          ? this.buildSectionEditPrompt(
              sectionHtml,
              this.rag.buildAugmentedPrompt(promptWithMemory, [])
            )
          : this.rag.buildAugmentedPrompt(promptWithMemory, []);
    }

    // ── 8. Create generation record ──────────────────────────────────────
    const gen = await generationRepository.create({
      projectId,
      userId,
      prompt: trimmedPrompt,
      augmentedPrompt,
      isSectionEdit,
      sectionId,
      sectionHtml,
      ragChunksUsed,
    });

    const generationId = gen._id.toString();

    // Set initial Redis status so SSE endpoint can check before subscribing
    await redis.set(REDIS_KEYS.jobStatus(generationId), 'queued', 'EX', CACHE_TTL.job);

    // ── 9. Enqueue the job ───────────────────────────────────────────────
    const jobData: GenerationJobData = {
      generationId,
      projectId,
      userId,
      augmentedPrompt,
      originalPrompt: trimmedPrompt,
      isSectionEdit,
      sectionId,
      sectionHtml,
      currentCode: project.currentCode ?? null,
      memorySignature: memory.signature,
    };

    await enqueueGeneration(jobData);

    logger.info('generation.enqueued', {
      generationId,
      projectId,
      userId,
      requestHash,
      queueDepth: queueHealth.pending,
    });

    return {
      jobId: generationId,
      status: 'queued',
      cached: false,
      queuePosition: queueHealth.pending,
      estimatedWaitSeconds: Math.ceil(queueHealth.pending * this.avgGenSeconds),
    };
  }

  /**
   * Returns the current generation status for a user-owned job.
   *
   * @returns MongoDB status with Redis status taking precedence for terminal states.
   */
  async getStatus(
    generationId: string,
    userId: string
  ): Promise<{
    status: string;
    output?: string | null;
  }> {
    const gen = await generationRepository.findById(generationId, userId);
    if (!gen) throw new NotFoundError('Generation not found.');

    // Check Redis first (faster)
    const redisStatus = await redis.get(REDIS_KEYS.jobStatus(generationId));

    if (redisStatus === 'done') {
      return { status: 'done', output: gen.output };
    }

    if (redisStatus === 'failed') {
      return { status: 'failed' };
    }

    return { status: gen.status, output: gen.output };
  }

  /**
   * Lists recent generation records for a user-owned project.
   *
   * @returns Recent, non-archived generation records for the project.
   */
  async getHistory(projectId: string, userId: string, limit = 10): Promise<IGeneration[]> {
    // Verify project ownership
    const project = await projectRepository.findOne(projectId, userId);
    if (!project) throw new NotFoundError('Project not found.');

    return generationRepository.findRecentByProject(projectId, limit);
  }

  private buildPromptWithMemory(instruction: string, memoryContext: string): string {
    if (!memoryContext) return instruction;

    return [memoryContext, '', '--- Latest user request ---', instruction].join('\n');
  }

  private buildSectionEditPrompt(currentSectionHtml: string, augmentedPrompt: string): string {
    return [
      '[SECTION_EDIT]',
      '',
      'Current section HTML (the section you must modify):',
      currentSectionHtml,
      '',
      'Modify only this section unless the latest user request explicitly requires broader changes.',
      '',
      augmentedPrompt,
    ].join('\n');
  }
}

export const generationService = new GenerationService(ragService, rateLimiterService);
