# API Test Guide

This file documents auth, project, and generation endpoints for your backend.

> All protected endpoints require authentication. Include a valid JWT token in the `Authorization` header:
>
> `Authorization: Bearer <token>`

---

## Base URLs

- Auth: `http://localhost:3000/api/auth`
- Projects: `http://localhost:3000/api/projects`
- Generation: `http://localhost:3000/api/generate`

---

# Auth Endpoints

## 1. Register

### Request

```bash
curl -X POST \
  http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "fullname": "User Name",
    "password": "StrongPassword123",
    "contact": "1234567890"
  }'
```

### Success response

```json
{
  "success": true,
  "data": {
    "_id": "642d4a...",
    "email": "user@example.com",
    "fullname": "User Name",
    "role": "user",
    "verified": false,
    "createdAt": "2026-05-28T00:00:00.000Z",
    "updatedAt": "2026-05-28T00:00:00.000Z"
  }
}
```

## 2. Login

### Request

```bash
curl -X POST \
  http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "StrongPassword123"
  }'
```

### Success response

```json
{
  "success": true,
  "data": {
    "token": "<jwt_token>",
    "user": {
      "_id": "642d4a...",
      "email": "user@example.com",
      "fullname": "User Name",
      "role": "user",
      "verified": true
    }
  }
}
```

## 3. Verify email

### Request

```bash
curl -X GET \
  "http://localhost:3000/api/auth/verify-email?token=<verification_token>"
```

### Success response

```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

## 4. Resend verification

### Request

```bash
curl -X POST \
  http://localhost:3000/api/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

### Success response

```json
{
  "success": true,
  "message": "Verification email resent"
}
```

## 5. Forgot password

### Request

```bash
curl -X POST \
  http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

### Success response

```json
{
  "success": true,
  "message": "Password reset email sent"
}
```

## 6. Reset password

### Request

```bash
curl -X POST \
  http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "<reset_token>",
    "password": "NewStrongPassword123"
  }'
```

### Success response

```json
{
  "success": true,
  "message": "Password reset successful"
}
```

## 7. Google auth

### Request

When Google authentication is configured, use:

```bash
curl -X GET http://localhost:3000/api/auth/google
```

Google will redirect to the configured callback URL.

## 8. Get current user

### Request

```bash
curl -X GET \
  http://localhost:3000/api/auth/get-me \
  -H "Authorization: Bearer <token>"
```

### Success response

```json
{
  "success": true,
  "data": {
    "_id": "642d4a...",
    "email": "user@example.com",
    "fullname": "User Name",
    "role": "user",
    "verified": true
  }
}
```

## 9. Logout

### Request

```bash
curl -X POST \
  http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <token>"
```

### Success response

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

# Project Endpoints

## 1. List all projects

### Request

```bash
curl -X GET \
  http://localhost:3000/api/projects \
  -H "Authorization: Bearer <token>"
```

### Success response

```json
{
  "success": true,
  "data": [
    {
      "_id": "642d4a...",
      "userId": "642d12...",
      "name": "Landing page project",
      "currentCode": "<div>...</div>",
      "createdAt": "2026-05-28T00:00:00.000Z",
      "updatedAt": "2026-05-28T00:00:00.000Z"
    }
  ]
}
```

## 2. Create a project

### Request

```bash
curl -X POST \
  http://localhost:3000/api/projects \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New marketing page",
    "currentCode": "<section>...</section>"
  }'
```

### Success response

```json
{
  "success": true,
  "data": {
    "_id": "642d4a...",
    "userId": "642d12...",
    "name": "New marketing page",
    "currentCode": "<section>...</section>",
    "createdAt": "2026-05-28T00:00:00.000Z",
    "updatedAt": "2026-05-28T00:00:00.000Z"
  }
}
```

## 3. Get a single project

### Request

```bash
curl -X GET \
  http://localhost:3000/api/projects/<projectId> \
  -H "Authorization: Bearer <token>"
```

### Success response

```json
{
  "success": true,
  "data": {
    "_id": "642d4a...",
    "userId": "642d12...",
    "name": "New marketing page",
    "currentCode": "<section>...</section>",
    "createdAt": "2026-05-28T00:00:00.000Z",
    "updatedAt": "2026-05-28T00:00:00.000Z"
  }
}
```

## 4. Update a project

### Request

```bash
curl -X PATCH \
  http://localhost:3000/api/projects/<projectId> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated project name",
    "currentCode": "<section>Updated code</section>"
  }'
```

### Success response

```json
{
  "success": true,
  "data": {
    "_id": "642d4a...",
    "userId": "642d12...",
    "name": "Updated project name",
    "currentCode": "<section>Updated code</section>",
    "createdAt": "2026-05-28T00:00:00.000Z",
    "updatedAt": "2026-05-28T00:00:00.000Z"
  }
}
```

## 5. Delete a project

### Request

```bash
curl -X DELETE \
  http://localhost:3000/api/projects/<projectId> \
  -H "Authorization: Bearer <token>"
```

### Success response

```http
HTTP/1.1 204 No Content
```

---

# Generation Endpoints

## 1. Enqueue a generation job

### Request

```bash
curl -X POST \
  http://localhost:3000/api/generate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "<projectId>",
    "prompt": "Generate a responsive landing page section with Tailwind.",
    "isSectionEdit": false,
    "sectionId": null,
    "sectionHtml": null
  }'
```

### Success response

```json
{
  "success": true,
  "data": {
    "cached": false,
    "jobId": "642d4a...",
    "status": "streaming"
  }
}
```

## 2. Stream generation tokens

### Request

```bash
curl -N \
  http://localhost:3000/api/generate/stream/<jobId> \
  -H "Authorization: Bearer <token>"
```

### Response

- Uses Server-Sent Events (`text/event-stream`)
- Messages will arrive as JSON payloads such as:

```json
{ "type": "token", "data": "<html chunk>" }
```

## 3. Get job status

### Request

```bash
curl -X GET \
  http://localhost:3000/api/generate/status/<jobId> \
  -H "Authorization: Bearer <token>"
```

### Success response

```json
{
  "success": true,
  "data": {
    "status": "streaming"
  }
}
```

## 4. Get generation history

### Request

```bash
curl -X GET \
  "http://localhost:3000/api/generate/history/<projectId>?limit=10" \
  -H "Authorization: Bearer <token>"
```

### Success response

```json
{
  "success": true,
  "data": [
    {
      "_id": "642d4a...",
      "projectId": "642d12...",
      "status": "done",
      "output": "<generated html>",
      "tokenCount": 123,
      "durationMs": 1234,
      "createdAt": "2026-05-28T00:00:00.000Z",
      "updatedAt": "2026-05-28T00:00:00.000Z"
    }
  ]
}
```

---

# Notes

- Use the same authenticated user for auth, projects, and generation requests.
- `projectId` and `jobId` must be valid MongoDB ObjectIds.
- `prompt` must be between 5 and 2000 characters.
- Section edit mode requires `isSectionEdit: true` and a valid `sectionId`.
- If you need the JWT token, login first and use the returned token in `Authorization`.
