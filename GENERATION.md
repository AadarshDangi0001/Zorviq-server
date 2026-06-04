# Generation System Overview

This document describes the generation pipeline implemented in the current
codebase. It documents existing behavior only.

## Entry Points

Generation routes live in `src/routes/generate.routes.ts` and require JWT
authentication.

- `POST /api/generate`: validate and enqueue a generation request.
- `GET /api/generate/stream/:jobId`: open an SSE connection for a generation.
- `GET /api/generate/status/:jobId`: polling fallback for job status.
- `GET /api/generate/history/:projectId`: recent generation history for a
  project.

## Controller Layer

`src/controllers/generate.controller.ts` handles HTTP concerns:

- Reads the authenticated user ID from the request.
- Accepts validated request data from Zod middleware.
- Delegates enqueue/status/history work to `generationService`.
- Opens SSE responses, checks job ownership, replays buffered Redis output, and
  subscribes to Redis pub/sub for completion or failure messages.

SSE messages are JSON payloads written as `data: ...` lines. Current event types
inside the JSON payload are:

- `token`: contains generated HTML data. In the current worker, this is the final
  validated HTML, not raw live model chunks.
- `done`: marks successful completion.
- `error`: marks generation failure.

## Service Layer

`src/services/generation.service.ts` owns the enqueue decision flow:

1. Trim and validate prompt length.
2. Verify that the project belongs to the authenticated user.
3. Apply Redis-backed per-user rate limiting.
4. Fail stale active generations and enforce the active-generation limit.
5. Check in-process queue health.
6. Look up the Redis prompt cache.
7. Retrieve RAG components and build the augmented prompt.
8. Create a MongoDB generation record.
9. Store initial Redis job status.
10. Add the job to the in-process queue.

Cache hits skip RAG and queue work. They create a completed generation record,
update the project code from cache, update Redis job status to `done`, and return
HTTP `200` with the cached code.

Cache misses return HTTP `202` with a job ID, queue position, and estimated wait.

## RAG

`src/services/rag.service.ts` retrieves reference components from Pinecone only
when all required configuration exists:

- `GEMINI_API_KEY`
- `PINECONE_API_KEY`
- `PINECONE_INDEX_HOST`

The prompt is embedded through the embedding analysis service, searched against
the configured Pinecone namespace, filtered by score, and limited to five
reference chunks.

If RAG configuration is missing or retrieval fails, the service logs the
condition and continues with the plain generation contract plus user prompt.

## LLM Provider

`src/services/llm.service.ts` calls Amazon Bedrock through
`@aws-sdk/client-bedrock-runtime`.

The default model is Bedrock Nova Pro:

- `BEDROCK_MODEL_ID`, default `amazon.nova-pro-v1:0`
- `BEDROCK_INFERENCE_PROFILE_ID`, optional override for profile-based access
- `AWS_REGION`, default `ap-south-1`

The LLM service reads the Bedrock response, chunks the returned text internally,
tracks approximate token count, retries retryable failures, and uses a
module-level circuit breaker after repeated failures.

## Queue and Worker

`src/queue/generation.queue.ts` uses in-process `p-queue`.

- Concurrency comes from `QUEUE_CONCURRENCY`, bounded from 1 to 5.
- Queue timeout is 120 seconds.
- Queue health is considered unhealthy at 50 pending jobs.
- Jobs are not persisted in a distributed queue.

The worker:

1. Marks the generation `streaming` in MongoDB and Redis.
2. Calls Bedrock through `llmService`.
3. Accumulates the full generated output.
4. Sanitizes and validates the complete output.
5. Optionally performs embedding-backed pattern analysis.
6. Applies section replacement for section edit jobs.
7. Updates generation status and project code.
8. Writes prompt cache and job status to Redis.
9. Pushes the final HTML to the Redis reconnect buffer.
10. Publishes the final HTML and then `__DONE__` to Redis.

The worker deliberately publishes only validated HTML to clients. It does not
stream raw, unvalidated model chunks to SSE clients.

## Validation

`src/services/codeValidator.service.ts` sanitizes model output and validates:

- minimum generated length
- escaped newline or quote artifacts
- dangerous browser APIs and inline handlers
- standalone document structure for full-page generations
- Tailwind CDN presence when Tailwind utility classes are used
- invalid Tailwind `scale-103` usage
- external asset URL requirements
- basic tag nesting

Section edit requests allow HTML fragments.

## Redis Responsibilities

Redis supports:

- generation rate limiting
- prompt cache
- job status checks
- SSE reconnect buffer
- Redis pub/sub notifications

Generation paths use the runtime-checked `redis` proxy. If Redis is not
configured, those paths throw a service-unavailable error.

## Persistence

MongoDB stores:

- generation request metadata
- augmented prompt
- final output
- status
- duration and token count
- error messages
- section edit metadata

Project `currentCode` is updated after a successful generation or cache hit.
Project and generation access is scoped by authenticated user ID.

## Failure Behavior

- RAG failures are non-fatal and fall back to the plain prompt.
- Bedrock failures are retried and then handled by the queue processor.
- Validation failures mark the generation failed and publish an SSE error signal.
- Failure persistence is attempted but logged if that persistence fails.
- SSE disconnects clean up heartbeat timers and Redis subscriber connections.
