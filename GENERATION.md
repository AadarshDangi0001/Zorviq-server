# Generation System Overview

This document explains the generation pipeline, the files involved, and how they connect.

## 1. Entry point: routes

### `src/routes/generate.routes.ts`
- Defines generation-related HTTP routes.
- Uses authentication middleware before allowing generation requests.
- Routes:
  - `POST /api/generate` → enqueue generation
  - `GET /api/generate/stream/:jobId` → SSE stream for live tokens
  - `GET /api/generate/status/:jobId` → polling fallback status
  - `GET /api/generate/history/:projectId` → project generation history

## 2. Controller layer

### `src/controllers/generate.controller.ts`
- Receives HTTP requests and calls the service layer.
- `enqueueGeneration` validates request body and delegates to `generationService.enqueue`.
- `streamGeneration` opens a Server-Sent Events connection and subscribes to Redis pub/sub.
- `getGenerationStatus` and `getGenerationHistory` forward requests to `generationService`.

## 3. Service layer

### `src/services/generation.service.ts`
- Primary business logic for queuing and checking generation jobs.
- Responsibilities:
  - verify the project belongs to the user
  - enforce per-user concurrency and rate limits
  - check prompt cache
  - build augmented prompt via RAG
  - create a generation record
  - enqueue the job with priority
- Returns either a cached result or a queued job response.

### `src/services/rag.service.ts`
- Provides retrieval of reference components for prompt augmentation.
- Currently returns an empty array placeholder.
- Used by `generationService` to build `augmentedPrompt`.

### `src/services/llm.service.ts`
- Streams tokens from the Anthropic Claude model.
- Handles retries, circuit breaker logic, and streaming metadata.
- Called from the queue processor.

### `src/services/rateLimiter.service.ts`
- Enforces per-user rate limits using Redis.
- Called before queueing a generation.

## 4. Queue and worker

### `src/queue/generation.queue.ts`
- Contains the `generationQueue` powered by `p-queue`.
- Defines `GenerationJobData` and Redis key helpers.
- Implements the job processor `processGenerationJob`.
- Worker responsibilities:
  - update generation status to `streaming`
  - stream Claude tokens and publish them to Redis
  - buffer tokens for reconnecting clients
  - validate and sanitize final output
  - replace section HTML for section edit jobs
  - persist results and update project code
  - publish completion or error events

### Redis support
- `src/config/redis.ts` exports the Redis client and a runtime-checked `redis` helper.
- Redis is used for:
  - prompt cache
  - job status tracking
  - SSE token buffering
  - pub/sub event delivery
  - rate limiting

## 5. Persistence layer

### `src/models/Generation.model.ts`
- Defines the `Generation` schema and type.
- Tracks prompt, augmented prompt, output, status, section edit metadata, token count, and durations.
- Includes helper `findRecentByProject` for history queries.

### `src/repositories/generation.repository.ts`
- CRUD operations for generation records.
- Exposes methods like `create`, `updateStatus`, `findById`, `getOutput`, `countActive`, and `findRecentByProject`.

### `src/models/Project.model.ts`
- Minimal project schema used by generation.
- Stores `userId`, `name`, and `currentCode`.

### `src/repositories/project.repository.ts`
- Provides `findOne(projectId, userId)` to verify ownership.
- Provides `updateCode(projectId, userId, currentCode)` to persist generated code.

## 6. How the pieces connect

1. Client calls `POST /api/generate`.
2. `generate.routes.ts` authenticates and validates input.
3. `generate.controller.ts` calls `generationService.enqueue`.
4. `generation.service.ts` checks project ownership and limits.
5. If cached, it returns cached HTML immediately.
6. Otherwise, the service creates a generation record and calls `enqueueGeneration`.
7. `generation.queue.ts` schedules `processGenerationJob`.
8. Worker streams from `llmService`, publishes live tokens to Redis, and buffers them.
9. Client connects to `GET /api/generate/stream/:jobId` and receives SSE tokens.
10. When the job finishes, the worker updates the DB and publishes `__DONE__`.

## 7. Notes

- Auth flows are implemented in separate files and were not modified.
- The generation pipeline now compiles cleanly after fixing Redis typing and project repository wiring.
- The `project.repository` and `Project.model` files were added so generation can verify ownership and save generated code.
