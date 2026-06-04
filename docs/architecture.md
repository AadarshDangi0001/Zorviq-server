# Backend Architecture

## System Overview

Zorviq Server is an Express TypeScript API that coordinates authentication,
project storage, AI website generation, server-sent events, and ZIP export.

```text
Client
  -> Express API
  -> Auth, project, generation, and export controllers
  -> Services and repositories
  -> In-process p-queue worker
  -> Bedrock Nova LLM
  -> Output sanitization and validation
  -> MongoDB persistence
  -> Redis status, cache, rate limit, and SSE pub/sub
  -> SSE result delivery
```

The application is intentionally layered:

- Routes attach authentication and validation middleware.
- Controllers translate HTTP requests into service calls.
- Services enforce business rules and orchestrate repositories or external
  systems.
- Repositories isolate MongoDB queries and ownership checks.
- Redis supports generation-specific runtime state.

## Request Lifecycle

The generation request path is:

```text
POST /api/generate
  -> JWT authentication
  -> Zod request validation
  -> project ownership check
  -> Redis-backed rate limit
  -> per-user active generation limit
  -> in-process queue health check
  -> Redis prompt cache lookup
  -> optional RAG prompt augmentation
  -> Generation record creation in MongoDB
  -> p-queue job scheduling
  -> Bedrock Nova model invocation
  -> generated HTML sanitization
  -> local and embedding-based validation
  -> Generation and Project persistence
  -> Redis status and prompt cache updates
  -> Redis pub/sub notification for SSE clients
```

Cache hits return immediately with HTTP `200` and a completed generation record.
Cache misses return HTTP `202` with a queued job ID.

The worker currently accumulates the Bedrock response internally, validates the
complete output, then publishes the validated final HTML to Redis. SSE clients
receive that final HTML as a `token` event followed by a `done` event. The code
does not currently publish unvalidated live model chunks to clients.

## Data Stores

### MongoDB

MongoDB stores durable application data:

- Users, credentials, OAuth identity, verification state, and password reset
  token hashes
- Projects and their current generated HTML
- Generation history, prompt metadata, status, output, token count, duration,
  RAG usage, and failure message

Project and generation reads are scoped by `userId` in repository queries to
enforce ownership.

### Redis

Redis is optional for auth/project cache reads because `cacheService` degrades to
no-op when no Redis client exists. It is required for generation features that
use the runtime-checked `redis` proxy:

- Per-user generation rate limiting
- Prompt result cache
- Job status lookup for polling and SSE reconnects
- Job output buffer for reconnecting SSE clients
- Pub/sub delivery to active SSE clients
- Logout token blocklist when configured

If Redis is absent and a generation path touches `redis`, the proxy throws a
service-unavailable error.

### Generation Cache

Prompt cache keys are scoped by:

- user ID
- project ID
- normalized prompt
- section edit flag and section ID
- current project code hash
- section HTML hash

This prevents a cached response for one project or code state from being reused
for a different project or section context.

### Queue

Generation jobs run in an in-process `p-queue` with configurable concurrency
bounded between 1 and 5. Queue health rejects new generation requests once the
pending queue reaches 50 jobs. This queue is not a distributed job system; a
process restart loses in-memory queued work, while MongoDB records may remain in
`queued` or `streaming` until stale active jobs are failed by later requests.

## Failure Modes

### Redis Unavailable

If Redis is not configured, `redisClient` is `null`. Cache-service calls become
no-ops, but generation-specific calls through the `redis` proxy throw
`ServiceUnavailableError`.

Operational impact:

- Generation enqueue can fail during rate limit or cache checks.
- SSE status, replay, and pub/sub cannot work.
- Logout token blocklisting is unavailable unless Redis is configured.

### Bedrock Unavailable

`LLMService` retries retryable Bedrock failures, then records failures in a
module-level circuit breaker. The queue processor catches final LLM failures,
marks the generation as `failed` in MongoDB and Redis, publishes `__ERROR__` to
SSE subscribers, and does not crash the server process.

### Validation Failure

Generated output is sanitized, checked for dangerous patterns, checked for
standalone HTML requirements when applicable, and optionally analyzed against
embedding-backed pattern matches. Blocking validation errors mark the generation
as `failed`, publish an SSE error signal, and leave the project code unchanged.

### Queue Failure

The queue logs job-level errors through `p-queue` events. The processor catches
runtime errors and attempts to persist failure status. If persistence of the
failure itself fails, the error is logged and swallowed so the process does not
crash.

### SSE Disconnect

The SSE controller starts a heartbeat interval and a duplicated Redis subscriber
connection for each stream. On client close or request error it clears the
heartbeat, unsubscribes, quits the subscriber, and logs disconnect. Completed or
failed jobs also trigger cleanup before the response closes.

If a client reconnects after completion, the SSE endpoint checks Redis job
status first and returns the stored output or a generic failure event.
