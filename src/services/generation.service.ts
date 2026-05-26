import { redis } from "../config/redis.js";
import { generationRepository } from "../repositories/generation.repository.js";
import { projectRepository } from "../repositories/project.repository.js";
import {
  enqueueGeneration,
  buildPromptCacheKey,
  getQueueHealth,
  REDIS_KEYS,
  CACHE_TTL,
  type GenerationJobData,
} from "../queue/generation.queue.js";
import { RagService } from "./rag.service.js";
import { RateLimiterService } from "./rateLimiter.service.js";
import { logger } from "../lib/logger.js";
import {
  NotFoundError,
  RateLimitError,
  ValidationError,
  ServiceUnavailableError,
} from "../lib/apiError.js";
import type { IGeneration } from "../models/Generation.model.js";
 
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
  status: "queued" | "done"; // 'done' when served from cache
  cached: boolean;
  code?: string;              // only present when cached = true
  queuePosition?: number;     // only when queued
  estimatedWaitSeconds?: number;
}
 
// ─────────────────────────────────────────────
// Generation Service
// ─────────────────────────────────────────────
export class GenerationService {
  // Rough estimate: average generation takes ~12 seconds
  private readonly avgGenSeconds = 12;
  // Max pending jobs before we reject with 503
  // Max concurrent active generations per user
  private readonly maxActivePerUser = 2;
 
  constructor(
    private rag: RagService,
    private rateLimiter: RateLimiterService
  ) {}
 
  /**
   * Primary method — called by the controller.
   * Validates → rate limits → cache check → RAG → enqueue → return jobId.
   */
  async enqueue(
    userId: string,
    projectId: string,
    prompt: string,
    plan: "free" | "pro",
    opts: EnqueueOptions = {}
  ): Promise<EnqueueResult> {
    const { isSectionEdit = false, sectionId = null, sectionHtml = null } = opts;
 
    // ── 1. Validate input ───────────────────────────────────────────────
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || trimmedPrompt.length < 5) {
      throw new ValidationError("Prompt must be at least 5 characters.");
    }
    if (trimmedPrompt.length > 2000) {
      throw new ValidationError("Prompt must not exceed 2000 characters.");
    }
    if (isSectionEdit && !sectionId) {
      throw new ValidationError(
        "sectionId is required for section edit requests."
      );
    }
 
    // ── 2. Verify project belongs to user ───────────────────────────────
    const project = await projectRepository.findOne(projectId, userId);
    if (!project) {
      throw new NotFoundError("Project not found.");
    }
 
    // ── 3. Rate limit check ─────────────────────────────────────────────
    await this.rateLimiter.check(userId);
 
    // ── 4. Check per-user active generation limit ───────────────────────
    const activeCount = await generationRepository.countActive(userId);
    if (activeCount >= this.maxActivePerUser) {
      throw new RateLimitError(
        `You already have ${activeCount} active generation(s). Please wait for them to complete.`
      );
    }
 
    // ── 5. Queue capacity check ─────────────────────────────────────────
    const queueHealth = getQueueHealth();
    if (!queueHealth.isHealthy) {
      throw new ServiceUnavailableError(
        "Server is under high load. Please try again in a moment."
      );
    }
 
    // ── 6. Prompt cache check ────────────────────────────────────────────
    const cacheKey = buildPromptCacheKey(trimmedPrompt, isSectionEdit, sectionId);
    const cachedOutput = await redis.get(cacheKey);
 
    if (cachedOutput) {
      logger.info("generation.cache_hit", { userId, projectId, cacheKey });
 
      // Create a generation record (for history) and immediately mark done
      const gen = await generationRepository.create({
        projectId,
        userId,
        prompt: trimmedPrompt,
        augmentedPrompt: trimmedPrompt, // no RAG needed for cached
        isSectionEdit,
        sectionId,
        sectionHtml,
        ragChunksUsed: 0,
      });
 
      await Promise.all([
        generationRepository.updateStatus(gen._id.toString(), {
          status: "done",
          output: cachedOutput,
          durationMs: 0,
        }),
        projectRepository.updateCode(projectId, userId, cachedOutput),
        // Mark job status in Redis so SSE clients don't hang
        redis.set(
          REDIS_KEYS.jobStatus(gen._id.toString()),
          "done",
          "EX",
          CACHE_TTL.job
        ),
      ]);
 
      return {
        jobId: gen._id.toString(),
        status: "done",
        cached: true,
        code: cachedOutput,
      };
    }
 
    // ── 7. RAG retrieval — fetch similar components ──────────────────────
    let augmentedPrompt: string;
    let ragChunksUsed = 0;
 
    try {
      const chunks = await this.rag.retrieveComponents(trimmedPrompt);
      ragChunksUsed = chunks.length;
      augmentedPrompt = this.rag.buildAugmentedPrompt(trimmedPrompt, chunks);
 
      // For section edits: prepend the current section HTML
      if (isSectionEdit && sectionHtml) {
        augmentedPrompt = this.buildSectionEditPrompt(
          trimmedPrompt,
          sectionHtml,
          augmentedPrompt
        );
      }
 
      logger.info("generation.rag_complete", {
        userId,
        promptLength: trimmedPrompt.length,
        ragChunks: ragChunksUsed,
        augmentedLength: augmentedPrompt.length,
      });
    } catch (ragErr) {
      // RAG failure is non-fatal — fall back to plain prompt
      logger.warn("generation.rag_failed", {
        error: ragErr,
        userId,
        projectId,
      });
      augmentedPrompt = isSectionEdit && sectionHtml
        ? this.buildSectionEditPrompt(trimmedPrompt, sectionHtml, trimmedPrompt)
        : trimmedPrompt;
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
    await redis.set(
      REDIS_KEYS.jobStatus(generationId),
      "queued",
      "EX",
      CACHE_TTL.job
    );
 
    // ── 9. Enqueue the job ───────────────────────────────────────────────
    const jobData: GenerationJobData = {
      generationId,
      projectId,
      userId,
      augmentedPrompt,
      originalPrompt: trimmedPrompt,
      isSectionEdit,
      sectionId,
      currentCode: project.currentCode ?? null,
    };
 
    const priority = plan === "pro" ? 10 : 1;
    await enqueueGeneration(jobData, priority);
 
    logger.info("generation.enqueued", {
      generationId,
      projectId,
      userId,
      priority,
      queueDepth: queueHealth.pending,
    });
 
    return {
      jobId: generationId,
      status: "queued",
      cached: false,
      queuePosition: queueHealth.pending,
      estimatedWaitSeconds: Math.ceil(
        queueHealth.pending * this.avgGenSeconds
      ),
    };
  }
 
  
  async getStatus(
    generationId: string,
    userId: string
  ): Promise<{
    status: string;
    output?: string | null;
  }> {
    // Check Redis first (faster)
    const redisStatus = await redis.get(
      REDIS_KEYS.jobStatus(generationId)
    );
 
    if (redisStatus === "done") {
      const output = await generationRepository.getOutput(generationId);
      return { status: "done", output };
    }
 
    if (redisStatus === "failed") {
      return { status: "failed" };
    }
 
    // Fall back to DB
    const gen = await generationRepository.findById(generationId, userId);
    if (!gen) throw new NotFoundError("Generation not found.");
 
    return { status: gen.status, output: gen.output };
  }
 
  /**
   * Get history for the history accordion.
   */
  async getHistory(
    projectId: string,
    userId: string,
    limit = 10
  ): Promise<IGeneration[]> {
    // Verify project ownership
    const project = await projectRepository.findOne(projectId, userId);
    if (!project) throw new NotFoundError("Project not found.");
 
    return generationRepository.findRecentByProject(projectId, limit);
  }
 
 
  private buildSectionEditPrompt(
    instruction: string,
    currentSectionHtml: string,
    ragContext: string
  ): string {
    return [
      "[SECTION_EDIT]",
      "",
      "Current section HTML (the section you must modify):",
      currentSectionHtml,
      "",
      "Edit instruction:",
      instruction,
      "",
      ...(ragContext !== instruction
        ? ["Reference components for layout/styling inspiration:", ragContext]
        : []),
    ].join("\n");
  }
}

import { ragService } from "./rag.service.js";
import { rateLimiterService } from "./rateLimiter.service.js";
 
export const generationService = new GenerationService(
  ragService,
  rateLimiterService
);