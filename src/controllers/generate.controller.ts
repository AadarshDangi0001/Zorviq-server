import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis.js';
import { generationService } from '../services/generation.service.js';
import { generationRepository } from '../repositories/generation.repository.js';
import { REDIS_KEYS } from '../queue/generation.queue.js';
import { logger } from '../lib/logger.js';
import { NotFoundError, ValidationError } from '../lib/apiError.js';
import { config } from '../config/env.js';
import { getAuthenticatedUserId } from '../utils/requestUser.js';

const getSseOrigin = (req: Request): string => {
  const allowedOrigins = config.FRONTEND_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const requestOrigin = req.headers.origin;

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return config.FRONTEND_URL || allowedOrigins[0] || config.LOCAL_FRONTEND_URL;
};

export async function enqueueGeneration(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);

    const {
      projectId,
      prompt,
      isSectionEdit = false,
      sectionId = null,
      sectionHtml = null,
    } = req.body;

    // Basic presence validation (zod schema on route does deep validation)
    if (!projectId || typeof projectId !== 'string') {
      throw new ValidationError('projectId is required.');
    }
    if (!prompt || typeof prompt !== 'string') {
      throw new ValidationError('prompt is required.');
    }

    const result = await generationService.enqueue(userId, projectId, prompt, {
      isSectionEdit,
      sectionId,
      sectionHtml,
    });

    // 202 Accepted — job is queued (or 200 if cached)
    const statusCode = result.cached ? 200 : 202;

    res.status(statusCode).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function streamGeneration(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { jobId } = req.params;
  const userId = getAuthenticatedUserId(req);

  // Validate the job belongs to this user before opening SSE
  const gen = await generationRepository.findById(jobId, userId).catch(() => null);
  if (!gen) {
    next(new NotFoundError('Generation not found.'));
    return;
  }

  // ── SSE setup ────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx/proxy buffering
  res.setHeader('Access-Control-Allow-Origin', getSseOrigin(req));
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.flushHeaders(); // send headers immediately — opens SSE connection

  // Helper: send a typed SSE message
  const send = (type: string, payload?: Record<string, unknown>): void => {
    const data = JSON.stringify({ type, ...(payload ?? {}) });
    res.write(`data: ${data}\n\n`);
  };

  // Helper: close cleanly
  const close = (): void => {
    res.end();
  };

  logger.info('sse.connected', { jobId, userId });

  // ── 1. Check if job already done (client reconnect case) ────────────
  const currentStatus = await redis.get(REDIS_KEYS.jobStatus(jobId));

  if (currentStatus === 'done') {
    const output = await generationRepository.getOutput(jobId, userId);
    send('done', { code: output });
    close();
    return;
  }

  if (currentStatus === 'failed') {
    send('error', { message: 'Generation failed. Please try again.' });
    close();
    return;
  }

  // ── 2. Replay buffered output for late-joining clients ───────────────
  // (client may connect after the worker already published the validated result)
  try {
    const buffered = await redis.lrange(REDIS_KEYS.jobBuffer(jobId), 0, -1);
    if (buffered.length > 0) {
      logger.info('sse.replaying_buffer', {
        jobId,
        tokenCount: buffered.length,
      });
      for (const token of buffered) {
        send('token', { data: token });
      }
    }
  } catch (bufferErr) {
    logger.warn('sse.buffer_replay_failed', { jobId, error: bufferErr });
    // Non-fatal — continue with live stream
  }

  // ── 3. Subscribe to Redis Pub/Sub for generation result events ───────
  // IMPORTANT: must use a dedicated Redis connection for subscribe mode
  const subscriber = redis.duplicate();

  await subscriber.subscribe(REDIS_KEYS.jobChannel(jobId));

  subscriber.on('message', (_channel: string, message: string) => {
    if (message === '__DONE__') {
      send('done');
      cleanup();
      close();
      return;
    }

    if (message === '__ERROR__') {
      send('error', { message: 'Generation failed. Please try again.' });
      cleanup();
      close();
      return;
    }

    // Generated output payload — forward directly
    send('token', { data: message });
  });

  // ── 4. Heartbeat — keep connection alive through proxies ─────────────
  // SSE comment lines (": ping") are ignored by EventSource but prevent timeout
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': ping\n\n');
    }
  }, 25_000);

  // ── 5. Cleanup on client disconnect ─────────────────────────────────
  const cleanup = (): void => {
    clearInterval(heartbeat);
    subscriber.unsubscribe().catch(() => {});
    subscriber.quit().catch(() => {});
    logger.info('sse.disconnected', { jobId, userId });
  };

  req.on('close', () => {
    cleanup();
    // Don't call close() — connection is already closed by client
  });

  req.on('error', () => {
    cleanup();
  });
}

// ─────────────────────────────────────────────
// GET /api/generate/:jobId/status
// Polling fallback for environments where SSE is unreliable
// ─────────────────────────────────────────────
export async function getGenerationStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const { jobId } = req.params;

    const result = await generationService.getStatus(jobId, userId);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────
// GET /api/generate/history/:projectId
// ─────────────────────────────────────────────
export async function getGenerationHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getAuthenticatedUserId(req);
    const { projectId } = req.params;
    const requestedLimit = parseInt((req.query.limit as string) ?? '10', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 20) : 10;

    const history = await generationService.getHistory(projectId, userId, limit);

    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
}
