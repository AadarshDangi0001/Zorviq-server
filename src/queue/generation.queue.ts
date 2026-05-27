import PQueue from "p-queue";
import crypto from "crypto";
import { redis } from "../config/redis.js";
import { llmService } from "../services/llm.service.js";
import { generationRepository } from "../repositories/generation.repository.js";
import { projectRepository } from "../repositories/project.repository.js";
import { logger } from "../lib/logger.js";
import { CodeValidatorService } from "../services/codeValidator.service.js";
 

export interface GenerationJobData {
  generationId: string;
  projectId: string;
  userId: string;
  augmentedPrompt: string;  // prompt + RAG context
  originalPrompt: string;   // used as cache key
  isSectionEdit: boolean;
  sectionId: string | null;
  currentCode: string | null; // needed for section replacement
}
 

export const REDIS_KEYS = {
  jobStatus:  (jobId: string) => `job:${jobId}:status`,
  jobBuffer:  (jobId: string) => `job:${jobId}:buf`,
  jobChannel: (jobId: string) => `job:${jobId}`,
  promptCache:(hash: string)  => `pc:${hash}`,
  queueDepth: ()              => "queue:depth",
} as const;
 
export const CACHE_TTL = {
  job:    3600,  // 1 hour — enough for any SSE reconnect window
  prompt: 3600,  // 1 hour — prompt result cache
} as const;
 
export function buildPromptCacheKey(
  prompt: string,
  isSectionEdit: boolean,
  sectionId?: string | null
): string {
  const raw = JSON.stringify({
    prompt: prompt.trim().toLowerCase(),
    isSectionEdit,
    sectionId: sectionId ?? null,
  });
  return REDIS_KEYS.promptCache(
    crypto.createHash("sha256").update(raw).digest("hex")
  );
}
 
// ─────────────────────────────────────────────
// Section edit: replace one section in full page code
// ─────────────────────────────────────────────
function applySectionEdit(
  currentCode: string,
  sectionId: string,
  newSectionHtml: string
): string {
  // Match the opening tag of the section (any element with data-section-id)
  // and everything up to (but not including) the next section or end of string
  const escapedId = sectionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
 
  // Strategy: find the section tag, then find its closing tag by counting nesting
  const openTagPattern = new RegExp(
    `<([a-zA-Z][a-zA-Z0-9]*)([^>]*data-section-id=["']${escapedId}["'][^>]*)>`,
    "s"
  );
 
  const match = openTagPattern.exec(currentCode);
  if (!match) {
    logger.warn("section_edit.section_not_found", { sectionId });
    // Fallback: append the new section rather than replacing
    return currentCode + "\n" + newSectionHtml;
  }
 
  const tagName = match[1];
  const startIndex = match.index;
 
  // Count nesting depth to find the matching closing tag
  let depth = 0;
  let i = startIndex;
  const openPattern = new RegExp(`<${tagName}(\\s|>)`, "gi");
  const closePattern = new RegExp(`</${tagName}>`, "gi");
 
  // Reset lastIndex
  openPattern.lastIndex = startIndex;
  closePattern.lastIndex = startIndex;
 
  let endIndex = -1;
 
  while (i < currentCode.length) {
    const nextOpen = openPattern.exec(currentCode);
    const nextClose = closePattern.exec(currentCode);
 
    if (!nextClose) break;
 
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      i = nextOpen.index + 1;
      openPattern.lastIndex = i;
      closePattern.lastIndex = i;
    } else {
      if (depth === 1) {
        endIndex = nextClose.index + `</${tagName}>`.length;
        break;
      }
      depth--;
      i = nextClose.index + 1;
      openPattern.lastIndex = i;
      closePattern.lastIndex = i;
    }
  }
 
  if (endIndex === -1) {
    logger.warn("section_edit.closing_tag_not_found", { sectionId, tagName });
    // Safe fallback: return original with appended edit
    return currentCode + "\n" + newSectionHtml;
  }
 
  return (
    currentCode.slice(0, startIndex) +
    newSectionHtml +
    currentCode.slice(endIndex)
  );
}
 

// p-queue configuration

export const generationQueue = new PQueue({
  concurrency: parseInt(process.env.QUEUE_CONCURRENCY ?? "5", 10),
  timeout: 120_000,    // 2 min max per job — Claude's worst case
});
 

generationQueue.on("add", () => {
  logger.info("queue.job_added", {
    pending: generationQueue.pending,
    size: generationQueue.size,
  });
});
 
generationQueue.on("completed", () => {
  logger.info("queue.job_completed", {
    pending: generationQueue.pending,
    size: generationQueue.size,
  });
});
 
generationQueue.on("error", (err) => {
  logger.error("queue.job_error", { error: err });
});
 
/**
 * Get queue health snapshot — exposed via health endpoint and
 * returned in 202 response so frontend can show queue position.
 */
export function getQueueHealth(): {
  pending: number;
  running: number;
  isHealthy: boolean;
} {
  const pending = generationQueue.pending;
  const running = generationQueue.size - pending;
  return {
    pending,
    running,
    isHealthy: pending < 50, // degrade gracefully above 50 pending
  };
}
 

// Core job processor

const validator = new CodeValidatorService();
 
export async function processGenerationJob(
  job: GenerationJobData
): Promise<void> {
  const {
    generationId,
    projectId,
    userId,
    augmentedPrompt,
    originalPrompt,
    isSectionEdit,
    sectionId,
    currentCode,
  } = job;
 
  const channel = REDIS_KEYS.jobChannel(generationId);
  const startTime = Date.now();
 
  // Mark as streaming in DB + Redis
  await Promise.all([
    generationRepository.updateStatus(generationId, { status: "streaming" }),
    redis.set(REDIS_KEYS.jobStatus(generationId), "streaming", "EX", CACHE_TTL.job),
  ]);
 
  let fullOutput = "";
  let tokenCount = 0;
 
  try {
    // ── Stream from Claude ──────────────────────
    const streamGen = llmService.stream(augmentedPrompt);
    let iterResult: IteratorResult<string, { fullOutput: string; tokenCount: number; durationMs: number }>;
 
    while (!(iterResult = await streamGen.next()).done) {
      const token = iterResult.value as string;
      fullOutput += token;
 
      // Publish token to all active SSE subscribers
      // Buffer it for late-joining clients (reconnects)
      await Promise.all([
        redis.publish(channel, token),
        redis.rpush(REDIS_KEYS.jobBuffer(generationId), token),
      ]);
    }
 
    // Extract metadata from generator return value
    const result = iterResult.value as { fullOutput: string; tokenCount: number; durationMs: number };
    tokenCount = result.tokenCount;
 
    // ── Validate + sanitize output ──────────────
    const isValid = validator.isValid(fullOutput);
    if (!isValid) {
      logger.warn("generation.output_invalid", {
        generationId,
        outputLength: fullOutput.length,
      });
    }
    const safeOutput = isValid
      ? fullOutput
      : validator.sanitize(fullOutput);
 
    // ── For section edits: replace section in full page code ──
    let finalCode: string;
    if (isSectionEdit && sectionId && currentCode) {
      finalCode = applySectionEdit(currentCode, sectionId, safeOutput);
    } else {
      finalCode = safeOutput;
    }
 
    const durationMs = Date.now() - startTime;
 
    // ── Persist everything atomically ──────────
    await Promise.all([
      // Update generation record
      generationRepository.updateStatus(generationId, {
        status: "done",
        output: finalCode,
        tokenCount,
        durationMs,
      }),
 
      // Update project's current code
      projectRepository.updateCode(projectId, userId, finalCode),
 
      // Cache the result (keyed on original prompt, not augmented)
      redis.set(
        buildPromptCacheKey(originalPrompt, isSectionEdit, sectionId),
        finalCode,
        "EX",
        CACHE_TTL.prompt
      ),
 
      // Mark job as done in Redis (for SSE reconnect + status checks)
      redis.set(
        REDIS_KEYS.jobStatus(generationId),
        "done",
        "EX",
        CACHE_TTL.job
      ),
 
      // Set TTL on token buffer (no longer needed after done)
      redis.expire(REDIS_KEYS.jobBuffer(generationId), CACHE_TTL.job),
    ]);
 
    // Signal SSE subscribers that stream is complete
    await redis.publish(channel, "__DONE__");
 
    logger.info("generation.completed", {
      generationId,
      projectId,
      durationMs,
      tokenCount,
      outputLength: finalCode.length,
      isSectionEdit,
      wasInvalidOutput: !isValid,
    });
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";
 
    logger.error("generation.failed", {
      generationId,
      projectId,
      durationMs,
      error: err,
    });
 
    // Mark failed in DB + Redis
    await Promise.all([
      generationRepository.updateStatus(generationId, {
        status: "failed",
        durationMs,
        errorMessage,
      }),
      redis.set(
        REDIS_KEYS.jobStatus(generationId),
        "failed",
        "EX",
        CACHE_TTL.job
      ),
    ]).catch((persistErr) => {
      // Don't throw from error handler — log and move on
      logger.error("generation.failed_to_persist_failure", {
        persistErr,
        generationId,
      });
    });
 
    // Signal SSE subscribers of failure
    await redis.publish(channel, "__ERROR__").catch(() => {});
 
    // Re-throw so p-queue marks the job as failed
    throw err;
  }
}
 
/**
 * Add a job to the queue with priority.
 * Pro users (priority 10) run before free users (priority 1).
 * Returns immediately — actual processing is async.
 */
export async function enqueueGeneration(
  job: GenerationJobData,
  priority: number = 1
): Promise<void> {
  generationQueue.add(
    () => processGenerationJob(job),
    { priority }
  );
}