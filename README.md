# Zorviq Server

Backend API for Zorviq, an AI website generation platform with authentication,
project management, queued generation, SSE updates, caching, validation, and ZIP
exports.

## Requirements

- Node.js 18 or newer
- npm
- MongoDB
- Redis for generation rate limiting, cache, SSE status/pub-sub, reconnect
  buffers, and token blocklist behavior

## Setup

```bash
npm install
cp .env.example .env
npm run build
npm run dev
```

If `.env.example` is not present, create `.env` with the variables below.

## Environment Variables

Required:

- `MONGO_URI`: MongoDB connection string
- `JWT_SECRET`: secret used to sign auth and email verification tokens
- `FRONTEND_ORIGINS`: comma-separated allowed frontend origins

Recommended for full production behavior:

- `REDIS_URL` or `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: Redis connection
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: SMTP email
  delivery settings
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`: Google OAuth
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`: GitHub OAuth
  for repository deploy (create repo and push generated project files)
- `LOCAL_FRONTEND_URL`: local frontend URL used in development links
- `FRONTEND_URL`: production frontend URL
- `AWS_REGION`, `BEDROCK_MODEL_ID`, `BEDROCK_INFERENCE_PROFILE_ID`: Bedrock
  generation configuration
- AWS credentials through the standard AWS SDK provider chain
- `GEMINI_API_KEY`: embeddings for RAG and generated-code pattern analysis
- `PINECONE_API_KEY`, `PINECONE_INDEX_HOST`: RAG and pattern-analysis search

For local tests, email delivery is skipped with `SMTP_SKIP_EMAIL=true`.

## Commands

```bash
npm run dev       # build and run the local server with nodemon
npm run build     # compile TypeScript to dist
npm run lint      # run ESLint
npm run format    # format files with Prettier
npm start         # run the compiled production server
npm test          # run integration validation tests
npm run test:watch
```

The integration tests use Vitest, Supertest, and MongoDB Memory Server. In
restricted sandboxes, `npm test` may need permission to start the local in-memory
MongoDB listener.

## Architecture

Detailed architecture notes are in [docs/architecture.md](docs/architecture.md).

```text
Client
  -> Express API
  -> Auth, project, generation, export controllers
  -> Services and repositories
  -> Queue, cache, RAG, LLM, validation
  -> MongoDB and Redis
```

## API Overview

Authentication:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/get-me`
- `GET /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`

Projects:

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`

Generation:

- `POST /api/generate`
- `GET /api/generate/status/:jobId`
- `GET /api/generate/history/:projectId`
- `GET /api/generate/stream/:jobId`

Export:

- `GET /api/export/:projectId`

Health:

- `GET /health`

## Current Validation Coverage

The first production-readiness test slice covers:

- Registration stores users, hashes passwords, strips passwords from responses,
  and rejects duplicate email
- Login rejects unverified users and invalid credentials, issues JWTs for verified
  users, and authorizes protected endpoints
- Password reset rejects expired tokens, updates the password, rejects the old
  password, and accepts the new password
- Google OAuth service creates verified users and reuses existing accounts
- Project create, read, update, and delete works for the owner
- Cross-user project read, update, and delete attempts are blocked

Still to validate:

- Generation pipeline, including cache, validation, LLM failure handling, and
  queue stress
- SSE event ordering and connection cleanup
- ZIP export integrity
- Full user journey from registration through export
- OpenAPI documentation and lint/format enforcement
