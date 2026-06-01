# Software Requirements Specification
## AI Website Builder — Capstone Project

**Issuing institution:** Sheryians Coding School
**Project type:** Team capstone (3–4 members)
**Duration:** 14 days
**Document version:** 1.0
**Audience:** Student teams, faculty evaluators

---

## Table of contents

1. [Introduction](#1-introduction)
2. [Overall description](#2-overall-description)
3. [System architecture](#3-system-architecture)
4. [Functional requirements](#4-functional-requirements)
5. [Non-functional requirements](#5-non-functional-requirements)
6. [External interface requirements](#6-external-interface-requirements)
7. [Acceptance criteria](#7-acceptance-criteria)
8. [Deliverables](#8-deliverables)
9. [Timeline and milestones](#9-timeline-and-milestones)
10. [Ground rules](#10-ground-rules)
11. [Evaluation](#11-evaluation)
12. [Glossary](#12-glossary)

---

## 1. Introduction

### 1.1 Purpose

This document specifies the requirements for an AI-powered website builder, to be built by student teams as a capstone project. The system shall accept natural-language prompts from end users and generate, render, and allow editing of complete websites in real time. This SRS defines what the system must do, the constraints under which it must operate, and the criteria against which it will be evaluated.

### 1.2 Project scope

Teams will build a web application that allows a non-technical user to describe a website in plain English and receive a working, styled, deployable web page in return. The user can then click on any section of the generated page and request modifications through further natural-language prompts.

**In scope:**
- LLM-powered code generation (HTML/JSX + Tailwind CSS)
- Streamed output rendering
- Sandboxed live preview
- Section-targeted editing
- User authentication and project persistence
- Code export
- Public deployment

**Out of scope (unless attempted as the stretch feature):**
- Multi-page projects
- E-commerce functionality
- AI image generation
- Vision input
- Self-healing code generation
- One-click deploy to third-party hosts

### 1.3 Intended audience

| Reader | Use of this document |
|--------|----------------------|
| Student teams | Authoritative spec for what to build and how it will be graded |
| Faculty evaluators | Reference for acceptance criteria during demo day |
| Industry mentors (optional reviewers) | Context for design feedback |

### 1.4 Document conventions

- **MUST / SHALL** — non-negotiable requirement. Failing this caps the team's evaluation.
- **SHOULD** — strong recommendation. Absence requires justification.
- **MAY** — optional, generally relevant to stretch features.
- Requirements are numbered: `FR-XYZ` for functional, `NFR-XYZ` for non-functional.

### 1.5 References

- IEEE Std 830-1998 — Recommended Practice for Software Requirements Specifications
- Sandpack documentation: https://sandpack.codesandbox.io
- Anthropic Claude API reference: https://docs.claude.com
- OWASP iframe sandbox guidance: https://owasp.org

---

## 2. Overall description

### 2.1 Product perspective

The system is a standalone web application. It does not integrate with existing systems beyond a third-party LLM API and a managed database service. It is comparable in spirit to commercial tools such as Vercel v0, Lovable, Bolt.new, and Rollout — but is a learning exercise, not a commercial product.

### 2.2 Product functions (high level)

The system shall enable a user to:

1. Sign up and authenticate
2. Create a new project
3. Describe a website in natural language
4. Watch the website being generated in real time (streamed)
5. View the generated website in a live preview
6. Select any section of the preview and request modifications
7. Save, rename, and delete projects
8. Export the generated code

### 2.3 User classes

| Class | Description | Frequency |
|-------|-------------|-----------|
| End user | Non-technical individual creating websites | Primary, frequent |
| Authenticated user | A signed-in end user with persisted projects | Primary, frequent |
| Anonymous visitor | Visitor who hasn't signed up; can see landing page only | Secondary, infrequent |

There is no admin user role in this project's scope.

### 2.4 Operating environment

- **Client:** Modern evergreen browsers (Chrome, Firefox, Edge, Safari — current and previous major version)
- **Server:** Node.js runtime, deployed on a managed serverless platform (Vercel recommended)
- **Database:** PostgreSQL (via Supabase or equivalent)
- **LLM provider:** Anthropic Claude API (credits provided)
- **Network:** Public internet; HTTPS required

### 2.5 Design and implementation constraints

- The system MUST be deployed publicly and accessible via URL on demo day.
- The frontend SHALL be a single-page or app-router application built with React or a React-based framework.
- All code SHOULD be in TypeScript. Justification required if not.
- LLM API keys MUST NOT be exposed to the client under any circumstances.
- All LLM API calls MUST flow through a backend gateway controlled by the team.
- Generated code MUST be rendered inside a sandboxed iframe with `sandbox="allow-scripts"` (or stricter).

### 2.6 Assumptions and dependencies

- Each team is provided with shared LLM API credits, distributed by faculty.
- Each team is expected to have Git, GitHub, and a deployment account (Vercel or equivalent) set up by day 1.
- The project assumes baseline familiarity with React, REST APIs, and Tailwind. Ramp-up time on these is part of the challenge.

---

## 3. System architecture

### 3.1 High-level architecture

The system follows a three-tier architecture:

```
┌─────────────────────────────────────────┐
│         Browser (Client)                │
│  ┌──────────────────────────────────┐   │
│  │  Editor UI (React/Next.js)       │   │
│  │  • Prompt input                  │   │
│  │  • Project list                  │   │
│  │  • Section-click handler         │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │  Sandboxed Preview iframe        │   │
│  │  (renders generated code)        │   │
│  └──────────────────────────────────┘   │
└─────────┬───────────────────────────────┘
          │ HTTPS
          ▼
┌─────────────────────────────────────────┐
│       Backend (API Gateway)             │
│  • Auth middleware                      │
│  • LLM request proxy + streaming        │
│  • Rate limiting                        │
│  • Project CRUD                         │
└─────────┬───────────────┬───────────────┘
          │               │
          ▼               ▼
┌─────────────────┐  ┌──────────────────┐
│   LLM Provider  │  │   Database       │
│  (Claude API)   │  │  (Postgres)      │
└─────────────────┘  └──────────────────┘
```

### 3.2 Recommended tech stack

| Layer | Recommended | Acceptable alternatives |
|-------|-------------|-------------------------|
| Frontend framework | Next.js 14 (App Router) | Remix, Vite + React |
| Styling | Tailwind CSS + shadcn/ui | Plain Tailwind |
| Preview rendering | Sandpack | iframe with `srcDoc` |
| Backend | Next.js API routes | Express, Fastify, Hono |
| Database + Auth | Supabase | Neon + Clerk, Postgres + NextAuth |
| LLM | Claude Sonnet 4.6 | Any Claude or GPT model supporting streaming |
| Deployment | Vercel | Netlify, Railway |
| Language | TypeScript | (none — TS strongly required) |

Deviation from the recommended stack is allowed but MUST be justified in the team's README.

---

## 4. Functional requirements

### 4.1 Authentication and user management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-101 | The system SHALL allow new users to register using email + password or OAuth (Google) | MUST |
| FR-102 | The system SHALL allow registered users to log in and log out | MUST |
| FR-103 | The system SHALL maintain user sessions across browser refreshes | MUST |
| FR-104 | The system SHALL ensure users can access only their own projects | MUST |
| FR-105 | The system SHALL never expose plaintext passwords (hashing handled by auth provider) | MUST |

### 4.2 Project management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-201 | An authenticated user SHALL be able to create a new project | MUST |
| FR-202 | The system SHALL display a list of the user's existing projects with name and last-modified timestamp | MUST |
| FR-203 | A user SHALL be able to open an existing project and continue editing | MUST |
| FR-204 | A user SHALL be able to rename a project | SHOULD |
| FR-205 | A user SHALL be able to delete a project with a confirmation prompt | MUST |
| FR-206 | Each project SHALL persist: prompt history, current generated code, metadata (name, timestamps) | MUST |

### 4.3 Prompt and generation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-301 | The system SHALL accept a free-form natural-language prompt of up to 2000 characters | MUST |
| FR-302 | The system SHALL forward the prompt to an LLM via a backend gateway (never directly from client) | MUST |
| FR-303 | The system SHALL apply a team-authored system prompt that constrains output format and design | MUST |
| FR-304 | The system SHALL stream the LLM response back to the client (Server-Sent Events or equivalent) | MUST |
| FR-305 | The client SHALL render the streamed output progressively, updating the preview as new tokens arrive | MUST |
| FR-306 | The system SHALL validate the LLM output for parseability before final commit (no crash on malformed JSX/HTML) | MUST |
| FR-307 | The system SHALL persist prompt history for each project (queryable, chronological) | SHOULD |
| FR-308 | The system SHALL display a clear loading and streaming indicator during generation | MUST |

### 4.4 Preview and rendering

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-401 | Generated code SHALL render in a sandboxed iframe | MUST |
| FR-402 | The sandbox SHALL prevent generated code from accessing the parent window's DOM, cookies, or storage | MUST |
| FR-403 | Tailwind CSS classes SHALL be applied to rendered output | MUST |
| FR-404 | The preview SHALL support viewport toggles for mobile (375px), tablet (768px), and desktop (1280px+) widths | SHOULD |
| FR-405 | Console errors from the sandbox SHALL be surfaced to the user (not silently swallowed) | SHOULD |
| FR-406 | The preview SHALL update without a full page reload when generated code changes | MUST |

### 4.5 Section-targeted editing

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-501 | The user SHALL be able to click on any visible section in the preview to select it | MUST |
| FR-502 | The selected section SHALL be visually highlighted in the preview | MUST |
| FR-503 | The user SHALL be able to enter a natural-language edit instruction targeted to the selected section | MUST |
| FR-504 | The system SHALL regenerate only the selected section, preserving the rest of the page | MUST |
| FR-505 | The system SHALL maintain an edit history of at least the last 10 actions per project | SHOULD |
| FR-506 | The system SHALL support undo and redo of the last edit | SHOULD |

### 4.6 Export

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-601 | The user SHALL be able to export the current project as a downloadable archive (zip) containing standalone HTML/CSS/JS | MUST |
| FR-602 | Exported code SHALL run in any modern browser without requiring proprietary dependencies | MUST |
| FR-603 | The export SHALL include a minimal README with run instructions | SHOULD |

### 4.7 Stretch feature (pick exactly ONE)

Teams MUST attempt exactly one of the following. Picking more than one is graded against the team — a single polished stretch outscores multiple incomplete ones.

| ID | Stretch | Description |
|----|---------|-------------|
| FR-701 | Multi-page projects | Support multiple linked pages within one project, with navigation |
| FR-702 | AI image generation | Generate images via a provider (Flux, DALL-E, SD) and embed them into the layout |
| FR-703 | Vision input | Accept an uploaded screenshot of a website; the LLM builds an interpretation of it |
| FR-704 | Self-healing | Detect render errors in the sandbox; LLM is re-invoked with the error to patch its own output |
| FR-705 | One-click deploy | Push the user's generated site to a third-party host (Vercel, Netlify) via API |
| FR-706 | GitHub push | Authenticate to GitHub, create a repo, push the exported code |

---

## 5. Non-functional requirements

### 5.1 Performance

| ID | Requirement |
|----|-------------|
| NFR-101 | First token from the LLM SHALL appear in the UI within 3 seconds of prompt submission under normal load |
| NFR-102 | Streamed tokens SHALL be rendered within 100ms of receipt |
| NFR-103 | Preview SHALL re-render within 200ms of code completion |
| NFR-104 | Project list SHALL load within 1 second on a 4G connection |

### 5.2 Security

| ID | Requirement |
|----|-------------|
| NFR-201 | LLM API keys SHALL be stored as backend environment variables and never sent to the client |
| NFR-202 | All client–server traffic SHALL use HTTPS |
| NFR-203 | Generated code SHALL be rendered in an iframe with `sandbox="allow-scripts"` at minimum (no `allow-same-origin`) |
| NFR-204 | The backend SHALL enforce per-user rate limiting (default: 10 generations per minute) |
| NFR-205 | The system SHALL sanitize any user input before storing or displaying it (XSS prevention on user-facing fields, not generated content) |
| NFR-206 | API endpoints SHALL require valid auth tokens for any project access |
| NFR-207 | Environment files (`.env`, `.env.local`) SHALL be listed in `.gitignore` |

### 5.3 Reliability

| ID | Requirement |
|----|-------------|
| NFR-301 | The system SHALL handle malformed LLM output without crashing the UI |
| NFR-302 | The system SHALL display a user-friendly message on LLM API failure (not a raw stack trace) |
| NFR-303 | The system SHALL retry LLM calls up to 2 times on transient failure (5xx, timeout) |
| NFR-304 | Database operations SHALL fail closed — on error, the user sees a message, not a broken UI |

### 5.4 Usability

| ID | Requirement |
|----|-------------|
| NFR-401 | Loading state SHALL be visible during any async operation lasting more than 200ms |
| NFR-402 | Error messages SHALL be in plain language, not error codes |
| NFR-403 | The primary user flow (prompt → preview) SHALL be reachable within 2 clicks of the dashboard |
| NFR-404 | The interface SHALL be usable on screens 1024px wide and above |

### 5.5 Maintainability

| ID | Requirement |
|----|-------------|
| NFR-501 | The codebase SHALL be written in TypeScript with `strict: true` enabled |
| NFR-502 | The repository SHALL include a README with: project description, setup steps, environment variables required, architecture overview, contributor list |
| NFR-503 | The repository SHALL have a logical folder structure separating UI components, business logic, and API routes |
| NFR-504 | Code SHALL follow a consistent style enforced by a linter (ESLint) and formatter (Prettier) |
| NFR-505 | The repository SHALL include a `.env.example` with all required environment variable names (no values) |

---

## 6. External interface requirements

### 6.1 User interface

The application SHALL provide the following primary screens:

1. **Landing page** — public, describes the product, offers sign up / log in
2. **Auth screens** — sign up, log in, password reset
3. **Dashboard** — list of user's projects with create-new-project button
4. **Editor view** — split layout with prompt input panel on one side, live preview iframe on the other
5. **Account page** — basic profile info, logout

All screens SHALL match a coherent visual identity (consistent colors, typography, spacing).

### 6.2 LLM API interface

The backend SHALL communicate with the LLM provider via HTTPS, supporting streaming responses (Server-Sent Events or equivalent).

**Request payload SHALL include:**
- System prompt (team-authored)
- User prompt
- Conversation history (for edit operations)
- Model identifier
- Streaming flag enabled

**Response handling SHALL:**
- Parse streamed tokens incrementally
- Forward to client over a persistent connection (SSE, WebSocket, or chunked HTTP)
- Capture full response for persistence on completion

### 6.3 Database schema (minimum)

The system SHALL maintain at minimum:

**users** — `id`, `email`, `created_at`
**projects** — `id`, `user_id` (FK), `name`, `current_code`, `created_at`, `updated_at`
**generations** — `id`, `project_id` (FK), `prompt`, `output`, `created_at`, `is_section_edit` (bool), `section_id` (nullable)

Auth tables managed by the auth provider need not be re-specified.

### 6.4 Deployment

The application SHALL be deployed to a publicly accessible URL accessible without VPN. The URL SHALL be live and stable for the duration of demo day plus 7 days.

---

## 7. Acceptance criteria

A team's submission shall be accepted as MVP-complete if and only if all of the following pass when tested live by an evaluator on demo day:

1. ✅ Evaluator can sign up with a new email address
2. ✅ Evaluator can create a new project
3. ✅ Evaluator can enter a freshly-given prompt and see streamed output
4. ✅ Generated code renders in a sandboxed iframe with visible Tailwind styling
5. ✅ Evaluator can click a visible section in the preview, request an edit, and observe that only the targeted section changes
6. ✅ Evaluator can log out and log back in; the project persists
7. ✅ Evaluator can export the project as a zip and run it locally
8. ✅ The application is deployed at a public URL with no localhost dependencies

Failing any of items 1–8 places an evaluation ceiling on the team's overall score.

The stretch feature shall be accepted if it works without manual intervention during the demo (no "wait, let me restart" allowed).

---

## 8. Deliverables

By 23:59 IST on day 14, each team SHALL submit:

| # | Deliverable | Format |
|---|-------------|--------|
| 1 | Deployed application URL | Web link (publicly accessible) |
| 2 | GitHub repository | URL (public or with evaluator access granted) |
| 3 | README | Markdown, inside the repo |
| 4 | Demo video | Loom or YouTube unlisted, 5 minutes maximum |
| 5 | Reflection document | Markdown or PDF, 1 page maximum |
| 6 | System prompt artifact | Plain text or markdown, the actual system prompt(s) used |

Late submissions accrue a 10% penalty per 12 hours, capped at 40%.

---

## 9. Timeline and milestones

| Day | Milestone | Checkpoint |
|-----|-----------|------------|
| 1 | Team formation, role assignment, repo and accounts set up | Repo URL shared with faculty |
| 2 | Architecture finalized, end-to-end mock with hardcoded LLM output | Walking-skeleton demo |
| 4 | Real LLM integrated, streaming working in preview | Mid-week check-in (informal) |
| 6 | Section-click editing functional | — |
| 8 | Auth + persistence integrated | — |
| 10 | Stretch feature substantially complete | Final mid-point check-in |
| 12 | Feature freeze; bug bash begins | — |
| 13 | Documentation, demo video, deployment hardening | — |
| 14 | Demo day | Live evaluations |

---

## 10. Ground rules

1. **API credits are provided.** Cache aggressively, mock during development, hit real API only when needed. Wasteful use is graded negatively.
2. **All team members must contribute code.** Git blame is reviewed.
3. **Open-source code is allowed but must be cited.** Uncited copy-paste from another project is plagiarism and disqualifies the team.
4. **No demo magic.** The system must work with a fresh prompt provided live by the evaluator, not just the team's rehearsed prompt.
5. **API keys in commits = automatic deduction.** Use environment variables.
6. **If you finish the MVP early, polish before adding scope.** Polish beats scope.
7. **Ask questions early.** Faculty office hours are available on days 3, 7, and 10.

---

## 11. Evaluation

Teams will be scored across six categories, weighted as follows:

| Category | Weight | What's assessed |
|----------|--------|-----------------|
| MVP completion | 25% | All eight acceptance criteria pass live |
| Prompt engineering quality | 20% | System prompt is sophisticated, iterated, constrains output well |
| Output quality / design taste | 15% | Generated sites look distinct and good, not AI-slop |
| Code architecture | 15% | TypeScript, separation of concerns, maintainability |
| Stretch feature execution | 15% | Single polished stretch, not multiple half-done ones |
| Engineering hygiene | 10% | Git history, README, error handling, no committed secrets |

Final score is on a 0–100 scale.

**Banding:**
- **90–100:** Top performers — recommended for GSoC prep, ICPC, advanced cohorts
- **75–89:** Strong — solid contributors anywhere
- **60–74:** Capable — average for a coding-school cohort
- **Below 60:** Investigation required — either didn't ship or has gaps to address

Faculty will additionally probe individuals during the demo with questions such as:

- "Walk me through your system prompt. Why those constraints?"
- "What broke during development? How did you debug it?"
- "Show me the part of the code you're most proud of, and the part you're least proud of."
- "What did you learn that you didn't know two weeks ago?"

Answers reveal depth — used to differentiate within bands.

---

## 12. Glossary

| Term | Definition |
|------|------------|
| LLM | Large Language Model — the AI service that generates code from prompts (e.g., Claude, GPT) |
| System prompt | The instructions given to the LLM before user input, controlling its behavior and output format |
| Streaming | Receiving and rendering LLM output token-by-token as it is generated, rather than waiting for the full response |
| Sandbox / sandboxed iframe | A browser iframe with restricted permissions, preventing the embedded code from affecting the parent page |
| Section-targeted editing | The ability for the user to select one part of the generated page and edit only that part |
| MVP | Minimum Viable Product — the non-negotiable feature set every team must ship |
| Stretch feature | An optional advanced feature beyond the MVP; each team picks exactly one |
| SSE | Server-Sent Events — a unidirectional streaming protocol over HTTP |
| Sandpack | A CodeSandbox-built library for safely running and previewing user-generated code in the browser |
| Tailwind CSS | A utility-class-based CSS framework, recommended for styling consistency |

---

**End of document.**

_Issued by Sheryians Coding School. For questions, contact faculty during scheduled office hours on days 3, 7, and 10._
