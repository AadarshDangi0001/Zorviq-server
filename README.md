# Zorviq Server

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)

Backend API for **Zorviq**, an AI-powered website generation platform. This server manages authentication, project management, AI generation workflows, real-time streaming, RAG-based validation, and project exports.

---

## Features of zorviq

### AI Website Generation

* Converts natural language prompts into fully functional websites.
* Powered by AWS Bedrock (Nova Pro).
* Generates clean HTML and Tailwind CSS code.

### Real-Time Updates

* Server-Sent Events (SSE) for live generation progress.
* Redis Pub/Sub for efficient event broadcasting.
* Instant frontend synchronization.

### RAG & Pattern Intelligence

* Pinecone vector database integration.
* Google Gemini embeddings.
* Code pattern retrieval and memory injection.
* AI-generated code validation and optimization.

### Queue Management

* Background job processing with `p-queue`.
* Redis-backed caching and rate limiting.
* Reliable generation workflow management.

### Authentication & Security

* JWT authentication.
* Email/password login.
* Google OAuth integration.
* GitHub OAuth integration.
* Token blocklisting with Redis.

### Export & Deployment

* Export generated projects as ZIP archives.
* Deploy directly to GitHub repositories.
* Version-controlled project management.

---

## Tech Stack

| Category        | Technology             |
| --------------- | ---------------------- |
| Runtime         | Node.js (v18+)         |
| Language        | TypeScript             |
| Framework       | Express.js             |
| Database        | MongoDB + Mongoose     |
| Cache / PubSub  | Redis + ioredis        |
| AI Model        | AWS Bedrock (Nova Pro) |
| Embeddings      | Google Gemini          |
| Vector Database | Pinecone               |
| Validation      | Zod, Express Validator |
| Testing         | Vitest, Supertest      |

---

## Prerequisites

Before running the project, ensure you have:

* Node.js v18 or later
* npm
* MongoDB (Local or Atlas)
* Redis Server

---

## Getting Started

### 1. Clone Repository

```bash
git clone https://github.com/AadarshDangi0001/Zorviq-server.git
cd Zorviq-server
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Fill in all required credentials and API keys.

### 4. Build Project

```bash
npm run build
```

### 5. Start Development Server

```bash
npm run dev
```

Server will start on:

```bash
http://localhost:3000
```

---

## Environment Variables

### Core Configuration

```env
NODE_ENV=development
PORT=3000
FRONTEND_ORIGINS=http://localhost:5173
MONGO_URI=
JWT_SECRET=
```

### Redis

```env
REDIS_URL=
```

or

```env
REDIS_HOST=
REDIS_PORT=
REDIS_PASSWORD=
```

### AWS Bedrock

```env
AWS_REGION=
BEDROCK_MODEL_ID=
BEDROCK_INFERENCE_PROFILE_ID=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

### Google Gemini

```env
GEMINI_API_KEY=
GEMINI_EMBEDDING_MODEL=
GEMINI_EMBEDDING_DIMENSIONS=
```

### Pinecone

```env
PINECONE_API_KEY=
PINECONE_INDEX_HOST=
PINECONE_API_VERSION=
PINECONE_NAMESPACE=
PINECONE_COMPONENT_NAMESPACE=
PINECONE_MEMORY_NAMESPACE=
```

### SMTP

```env
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_SKIP_EMAIL=true
```

### Google OAuth

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=
```

### GitHub OAuth

```env
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=
```

---

## Architecture

```text
Client
   │
   ▼
Routes & Middleware
   │
   ▼
Controllers
   │
   ▼
Services Layer
   ├── LLM Service (AWS Bedrock)
   ├── RAG Service (Pinecone)
   ├── Project Memory
   └── Auth Service
   │
   ▼
Queue Worker (p-queue)
   │
   ▼
Redis Pub/Sub
   │
   ▼
SSE Stream
   │
   ▼
Frontend
```

### Flow Overview

1. Request received through routes.
2. Validation and authentication middleware execute.
3. Controllers trigger service operations.
4. AI generation is queued.
5. RAG validation and optimization occur.
6. Results are published through Redis.
7. SSE streams updates to clients in real time.

---

## API Endpoints

### Authentication

| Method | Endpoint             | Description          |
| ------ | -------------------- | -------------------- |
| POST   | `/api/auth/register` | Register user        |
| POST   | `/api/auth/login`    | Login user           |
| POST   | `/api/auth/logout`   | Logout user          |
| GET    | `/api/auth/get-me`   | Current user profile |
| GET    | `/api/auth/google`   | Google OAuth login   |

### Projects

| Method | Endpoint            |
| ------ | ------------------- |
| GET    | `/api/projects`     |
| POST   | `/api/projects`     |
| GET    | `/api/projects/:id` |
| PATCH  | `/api/projects/:id` |
| DELETE | `/api/projects/:id` |

### Generation

| Method | Endpoint                           |
| ------ | ---------------------------------- |
| POST   | `/api/generate`                    |
| GET    | `/api/generate/status/:jobId`      |
| GET    | `/api/generate/history/:projectId` |
| GET    | `/api/generate/stream/:jobId`      |

### Export & Integrations

| Method | Endpoint                 |
| ------ | ------------------------ |
| GET    | `/api/export/:projectId` |
| GET    | `/api/github/callback`   |

---

## Available Scripts

| Command              | Description                |
| -------------------- | -------------------------- |
| `npm run dev`        | Start development server   |
| `npm run build`      | Build TypeScript project   |
| `npm start`          | Start production server    |
| `npm run lint`       | Run ESLint                 |
| `npm run format`     | Format code using Prettier |
| `npm test`           | Run tests                  |
| `npm run test:watch` | Run tests in watch mode    |

---

## Project Structure

```text
src/
├── config/
├── controllers/
├── middleware/
├── models/
├── routes/
├── services/
├── queue/
├── validators/
├── utils/
├── types/
└── app.ts
```

---
 
## Security Features

* JWT Authentication
* OAuth Authentication
* Redis Token Blocklisting
* Request Validation
* Rate Limiting
* Protected Routes
* Secure Environment Variables

---

## Future Enhancements

* Multi-page website generation
* Team collaboration
* AI-powered deployment assistant
* Custom component marketplace
* Advanced template library
* Version history and rollback

---

## License

Licensed under the ISC License.

---

## Contributors

Built for the **Zorviq AI Website Generation Platform**.

Contributions, issues, and feature requests are welcome.
