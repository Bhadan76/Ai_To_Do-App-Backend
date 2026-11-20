# Daily Task API - Postman Collection & Environment

This directory contains the official Postman collection and environment files for the Daily Task backend.

## Files
- **`daily-task-api.postman_collection.json`**: Full Postman v2.1 collection covering all 26+ API endpoints.
- **`daily-task-api.postman_environment.json`**: Local environment configuration file.

## How to Import into Postman
1. Open **Postman**.
2. Click the **Import** button in the top-left corner.
3. Drag and drop both:
   - `daily-task-api.postman_collection.json`
   - `daily-task-api.postman_environment.json`
4. In the top-right environment selector, choose **"Daily Task Local Environment"**.

---

## Key Features & Automated Workflow

### 1. Automated Token Management
- When you run **`02. Authentication > Register`** or **`02. Authentication > Login`**, test scripts automatically extract:
  - `accessToken`
  - `refreshToken`
  and update the collection and environment variables.
- All protected endpoints (User Profile, Categories, Tasks, AI) automatically inherit the Bearer token (`{{accessToken}}`).
- When running **`Refresh Token`**, both tokens are rotated and saved automatically.
- When running **`Logout`**, the stored tokens are cleared.

### 2. Auto-Chaining Resource IDs
- **Create Category**: Automatically extracts `id` and sets `{{categoryId}}`.
- **Create Task**: Uses `{{categoryId}}` and automatically extracts `id` to set `{{taskId}}`.
- **Create AI Conversation**: Automatically extracts `id` to set `{{conversationId}}`.

---

## Endpoint Structure

### 01. System & Health
- `GET /api/v1` - Root welcome endpoint
- `GET /api/v1/health` - API process health status
- `GET /api/docs` - OpenAPI Swagger documentation

### 02. Authentication
- `POST /api/v1/auth/register` - Create user account and issue tokens
- `POST /api/v1/auth/login` - Authenticate with email/password
- `POST /api/v1/auth/refresh` - Rotate refresh token & issue new access token
- `POST /api/v1/auth/logout` - Revoke refresh token session

### 03. User Profile
- `GET /api/v1/users/me` - Get profile details
- `PATCH /api/v1/users/me` - Update name and avatar
- `PATCH /api/v1/users/me/password` - Change password (revokes sessions)
- `DELETE /api/v1/users/me` - Delete account

### 04. Categories
- `POST /api/v1/categories` - Create new category
- `GET /api/v1/categories` - List categories (with pagination: `page`, `pageSize`)
- `GET /api/v1/categories/:id` - Get category by UUID
- `PATCH /api/v1/categories/:id` - Update category
- `DELETE /api/v1/categories/:id` - Delete category

### 05. Tasks
- `POST /api/v1/tasks` - Create new task
- `GET /api/v1/tasks` - List tasks (paginated and sorted)
- `GET /api/v1/tasks?status=...&priority=...&categoryId=...` - Filter tasks
- `GET /api/v1/tasks?search=...` - Search tasks by text
- `GET /api/v1/tasks?dueDateFrom=...&dueDateTo=...` - Filter by ISO 8601 date range
- `GET /api/v1/tasks/:id` - Get task by UUID
- `PATCH /api/v1/tasks/:id` - Update task status/priority/dates/etc.
- `DELETE /api/v1/tasks/:id` - Delete task by UUID

### 06. AI Assistant
- `POST /api/v1/ai/conversations` - Start a new AI conversation
- `POST /api/v1/ai/conversations/:id/messages` - Send a message and get Gemini response
- `GET /api/v1/ai/conversations` - List conversations
- `GET /api/v1/ai/conversations/:id` - Get conversation details & history
- `DELETE /api/v1/ai/conversations/:id` - Delete conversation and messages
