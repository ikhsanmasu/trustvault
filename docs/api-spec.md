# TrustVault -- API Specification (P2)

This document is a **contract**. The `backend` agent implements exactly what is written here and the `frontend` agent calls exactly what is written here. Neither agent may silently change paths, field names, or types -- discrepancies must be flagged back to the architect.

---

## Conventions (Updated for P2)

- All endpoints are under `/api/`.
- Request bodies (where applicable) use `Content-Type: application/json` except where `multipart/form-data` is noted.
- All successful responses return `Content-Type: application/json`.
- Timestamps are ISO 8601 strings in UTC (e.g. `"2026-06-21T10:00:00.000Z"`).
- UUIDs are lowercase hyphenated strings (e.g. `"550e8400-e29b-41d4-a716-446655440000"`).
- Type annotations use TypeScript notation. `?` suffix means optional.
- **P2: All endpoints except auth-callback helpers require a valid Supabase session.** Auth is via HTTP-only cookie managed by `@supabase/ssr`. There is no `Authorization` header to send -- the cookie is sent automatically by the browser on same-origin requests.

### Auth Context (P2)

Every route handler begins by calling `requireAuth()` (see `architecture.md` Section 5, `lib/auth.ts`), which:

1. Creates a Supabase server client from the request cookies via `@supabase/ssr`.
2. Calls `supabase.auth.getUser()` to validate the session.
3. Returns the user object (containing `id`, `email`) or sends a 401 response.

**The frontend must NOT manually attach auth headers.** The Supabase client in the browser automatically manages the session cookie. For server-side API calls from the browser, use `fetch()` directly (cookies are sent automatically for same-origin requests) or the Supabase browser client's session to retrieve the access token.

### Standard Error Shape

All error responses use this shape:

```ts
type ErrorResponse = {
  error: string;   // human-readable message
  code?: string;   // machine-readable code (see per-endpoint error codes)
};
```

### HTTP Status Codes (Updated for P2)

| Status | Meaning |
|---|---|
| 200 | Success (GET, POST compare, PATCH) |
| 201 | Created (POST documents, POST projects) |
| 400 | Bad request (validation failure) |
| 401 | Unauthenticated -- no valid session |
| 403 | Forbidden -- authenticated but insufficient role/permission |
| 404 | Resource not found |
| 413 | File too large |
| 415 | Unsupported media type |
| 500 | Internal server error |

---

## Shared Types

```ts
// ===== Auth & Profile =====

type Profile = {
  id: string;           // UUID, equals auth.users.id
  tenant_id: string;    // UUID
  display_name: string | null;
  created_at: string;   // ISO 8601 UTC
};

// ===== Projects =====

type Project = {
  id: string;           // UUID
  tenant_id: string;    // UUID
  name: string;
  description: string;
  created_at: string;   // ISO 8601 UTC
};

type ProjectMember = {
  id: string;           // UUID
  project_id: string;   // UUID
  user_id: string;      // UUID (references auth.users)
  role: 'admin' | 'editor' | 'viewer';
  created_at: string;   // ISO 8601 UTC
};

// ===== Documents (updated from P1) =====

type Document = {
  id: string;             // UUID
  name: string;           // user-supplied display name
  storage_path: string;   // path within the pdf-uploads bucket
  binary_hash: string;    // SHA-256 hex of raw file bytes (64 chars)
  text_hash: string;      // SHA-256 hex of extracted text (64 chars)
  extracted_text: string; // full extracted text (may be empty string)
  file_size_bytes: number;
  tenant_id: string;      // UUID (was null in P1, now always set)
  project_id: string;     // UUID (was null in P1, now always set)
  uploaded_by: string;    // UUID of auth.users (NEW in P2)
  created_at: string;     // ISO 8601 UTC
};

// ===== Compare (unchanged from P1) =====

type CompareResult = {
  docAId: string;
  docBId: string;
  stage: 'BINARY_MATCH' | 'TEXT_MATCH' | 'AI_COMPARE';
  verdict: 'IDENTICAL' | 'BINARY_DIFF_ONLY' | 'MATERIAL' | 'NOT_MATERIAL';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  reasoning: string | null;
};

// ===== Bulk Upload =====

type BulkUploadItem = {
  status: 'ok' | 'error';
  document?: Document;      // present on success
  error?: string;           // human-readable error message on failure
  code?: string;            // machine-readable error code on failure
  name?: string;            // the file name that was processed
};

type BulkUploadResult = {
  project_id: string;
  results: BulkUploadItem[];
  succeeded: number;
  failed: number;
};
```

---

## P2 Endpoint Index

| Method | Path | Auth | Role Required | Description |
|---|---|---|---|---|
| `GET` | `/api/profile` | Yes | -- | Get current user's profile |
| `POST` | `/api/projects` | Yes | -- | Create a new project |
| `GET` | `/api/projects` | Yes | -- | List user's projects |
| `GET` | `/api/projects/[id]` | Yes | member | Get project details |
| `PATCH` | `/api/projects/[id]` | Yes | admin | Update project name/description |
| `DELETE` | `/api/projects/[id]` | Yes | admin | Delete project |
| `GET` | `/api/projects/[id]/members` | Yes | member | List project members |
| `POST` | `/api/projects/[id]/members` | Yes | admin | Add a member to project |
| `PATCH` | `/api/projects/[id]/members/[userId]` | Yes | admin | Update a member's role |
| `DELETE` | `/api/projects/[id]/members/[userId]` | Yes | admin | Remove a member from project |
| `POST` | `/api/documents` | Yes | editor/admin | Upload a single document |
| `GET` | `/api/documents` | Yes | member | List documents (filtered by project) |
| `POST` | `/api/documents/bulk` | Yes | editor/admin | Upload multiple documents |
| `GET` | `/api/documents/[id]` | Yes | member | Get single document |
| `POST` | `/api/compare` | Yes | member | Compare two documents |

---

## Endpoints

---

### GET /api/profile

Return the authenticated user's profile, including their tenant.

#### Request

`Content-Type: none` (GET, no body)

#### Processing

1. `requireAuth()` -- get the current user. Return 401 if no session.
2. Query `profiles` where `id = user.id`.
3. Return 404 if no profile exists (should not happen if sign-up flow is correct).
4. Return 200 with the profile.

#### Response -- 200 OK

```ts
type GetProfileResponse = {
  profile: Profile;
};
```

Example:
```json
{
  "profile": {
    "id": "550e8400-...",
    "tenant_id": "3f2504e0-...",
    "display_name": "Alice",
    "created_at": "2026-06-21T10:00:00.000Z"
  }
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | No valid session |
| 404 | `NOT_FOUND` | Profile row does not exist |
| 500 | `DB_ERROR` | Postgres query failed |

---

### POST /api/projects

Create a new project. The creating user is automatically added as a project member with role `admin`.

#### Request

`Content-Type: application/json`

```ts
type CreateProjectRequest = {
  name: string;           // required, 1-255 characters
  description?: string;   // optional, default ""
};
```

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Get user's `tenant_id` from `profiles`.
3. Validate `name` is non-empty, max 255 characters.
4. Insert row into `projects` with the user's `tenant_id`.
5. Insert row into `project_members` with `user_id = user.id`, `role = 'admin'`.
6. Return 201 with the created project.

#### Response -- 201 Created

```ts
type CreateProjectResponse = {
  project: Project;
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `MISSING_NAME` | `name` field missing or empty |
| 400 | `NAME_TOO_LONG` | `name` exceeds 255 characters |
| 401 | `UNAUTHORIZED` | No valid session |
| 500 | `DB_ERROR` | Postgres insert failed |

---

### GET /api/projects

List projects the authenticated user is a member of, ordered by `created_at` descending (newest first).

#### Request

`Content-Type: none` (GET)

| Query param | Type | Required | Description |
|---|---|---|---|
| `search` | string | No | Case-insensitive substring match against `projects.name`. If omitted, all user's projects returned. |
| `limit` | number | No | Max results. Default: 50. Max: 200. |
| `offset` | number | No | Rows to skip. Default: 0. |

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Query `projects` joined with `project_members` where `user_id = user.id`.
3. Apply `search` filter on `name` if provided (ILIKE).
4. Order by `created_at DESC`.
5. Apply `LIMIT` and `OFFSET`.
6. Return the list.

#### Response -- 200 OK

```ts
type ListProjectsResponse = {
  projects: Project[];
  total: number;
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_LIMIT` | `limit` not a positive integer or exceeds 200 |
| 400 | `INVALID_OFFSET` | `offset` not a non-negative integer |
| 401 | `UNAUTHORIZED` | No valid session |
| 500 | `DB_ERROR` | Postgres query failed |

---

### GET /api/projects/[id]

Get a single project by ID. User must be a member of the project.

#### Request

`Content-Type: none` (GET with path parameter)

| Path param | Type | Required | Description |
|---|---|---|---|
| `id` | string (UUID) | Yes | The project UUID |

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id` is a valid UUID. Return 400 if not.
3. Query `projects` where `id = :id`. RLS ensures the user is a member.
4. Return 404 if no row found.
5. Return 200 with the project.

#### Response -- 200 OK

```ts
type GetProjectResponse = {
  project: Project;
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | `id` is not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 404 | `NOT_FOUND` | Project does not exist or user is not a member |
| 500 | `DB_ERROR` | Postgres query failed |

---

### PATCH /api/projects/[id]

Update a project's `name` and/or `description`. User must be an `admin` of the project.

#### Request

`Content-Type: application/json`

```ts
type UpdateProjectRequest = {
  name?: string;           // if provided, 1-255 characters
  description?: string;    // if provided, any string (can be empty)
};
```

At least one field must be provided.

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id` is a valid UUID.
3. Check user's role in the project via `project_members`. Return 403 if not `admin`.
4. Validate input: if `name` provided, must be non-empty and <= 255 chars.
5. Update the project row. RLS policy ensures only admins can update.
6. Return 200 with the updated project.

#### Response -- 200 OK

```ts
type UpdateProjectResponse = {
  project: Project;
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | `id` is not a valid UUID |
| 400 | `NO_FIELDS` | Neither `name` nor `description` provided |
| 400 | `NAME_TOO_LONG` | `name` exceeds 255 characters |
| 400 | `NAME_EMPTY` | `name` is an empty string |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User is not an admin of this project |
| 404 | `NOT_FOUND` | Project not found |
| 500 | `DB_ERROR` | Postgres update failed |

---

### DELETE /api/projects/[id]

Delete a project. Cascades to delete all `project_members` rows and all `documents` (via FK cascade). User must be an `admin`.

#### Request

`Content-Type: none` (DELETE, no body)

| Path param | Type | Required | Description |
|---|---|---|---|
| `id` | string (UUID) | Yes | The project UUID |

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id` is a valid UUID.
3. Check user's role is `admin`. Return 403 if not.
4. Delete the project. RLS + application check.
5. Return 200 with a confirmation.

#### Response -- 200 OK

```json
{
  "deleted": true
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | `id` is not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User is not an admin of this project |
| 404 | `NOT_FOUND` | Project not found |
| 500 | `DB_ERROR` | Postgres delete failed |

---

### GET /api/projects/[id]/members

List members of a project. User must be a member of the project.

#### Request

`Content-Type: none` (GET with path parameter)

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate project `id` is a valid UUID.
3. Verify user is a project member (RLS handles this; app layer also checks for clear 403).
4. Query `project_members` where `project_id = :id`. RLS ensures user can see members.
5. Return the list.

#### Response -- 200 OK

```ts
type ListMembersResponse = {
  members: ProjectMember[];
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | Project `id` is not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User is not a member of this project |
| 404 | `NOT_FOUND` | Project not found |
| 500 | `DB_ERROR` | Postgres query failed |

---

### POST /api/projects/[id]/members

Add a new member to the project. User must be an `admin` of the project. The target user must exist and belong to the same tenant.

#### Request

`Content-Type: application/json`

```ts
type AddMemberRequest = {
  user_id: string;    // UUID of the auth user to add
  role: 'admin' | 'editor' | 'viewer';
};
```

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate project `id` is a valid UUID.
3. Verify the calling user is an `admin` of the project. Return 403 if not.
4. Validate `user_id` is a valid UUID and `role` is one of the three allowed values.
5. Verify the target user exists and is in the same tenant as the project. Return 400 with `USER_NOT_IN_TENANT` if they are not.
6. Insert into `project_members`. Handle unique violation (user already a member) with 409.
7. Return 201 with the member row.

#### Response -- 201 Created

```ts
type AddMemberResponse = {
  member: ProjectMember;
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | Project `id` not a valid UUID |
| 400 | `INVALID_USER_ID` | `user_id` not a valid UUID |
| 400 | `INVALID_ROLE` | `role` is not one of `admin`, `editor`, `viewer` |
| 400 | `USER_NOT_IN_TENANT` | Target user does not belong to the same tenant as the project |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | Calling user is not an admin of this project |
| 404 | `NOT_FOUND` | Project not found |
| 409 | `ALREADY_MEMBER` | Target user is already a member of this project |
| 500 | `DB_ERROR` | Postgres insert failed |

---

### PATCH /api/projects/[id]/members/[userId]

Update a member's role. User must be an `admin` of the project. An admin cannot demote themselves (must be the last admin or transfer ownership -- enforced at app layer).

#### Request

`Content-Type: application/json`

```ts
type UpdateMemberRoleRequest = {
  role: 'admin' | 'editor' | 'viewer';
};
```

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate both UUIDs.
3. Verify calling user is an `admin`. Return 403 if not.
4. Validate `role` is one of the allowed values.
5. **Self-demotion check:** If `userId === callingUser.id` and `role !== 'admin'`, check that at least one other admin exists. Return 400 with `LAST_ADMIN` if not.
6. Update the `project_members` row. Return 200.

#### Response -- 200 OK

```ts
type UpdateMemberRoleResponse = {
  member: ProjectMember;
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | Project or user ID not a valid UUID |
| 400 | `INVALID_ROLE` | `role` is not one of `admin`, `editor`, `viewer` |
| 400 | `LAST_ADMIN` | Cannot remove the last admin (self-demotion blocked) |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | Calling user is not an admin |
| 404 | `NOT_FOUND` | Member row not found |
| 500 | `DB_ERROR` | Postgres update failed |

---

### DELETE /api/projects/[id]/members/[userId]

Remove a member from the project. User must be an `admin`. An admin cannot remove themselves if they are the last admin.

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate both UUIDs.
3. Verify calling user is an `admin`. Return 403 if not.
4. **Last admin check:** If `userId === callingUser.id`, count remaining admins. Block if this is the last one.
5. Delete the `project_members` row. Return 200.

#### Response -- 200 OK

```json
{
  "removed": true
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | Project or user ID not a valid UUID |
| 400 | `LAST_ADMIN` | Cannot remove the last admin |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | Calling user is not an admin |
| 404 | `NOT_FOUND` | Member row not found |
| 500 | `DB_ERROR` | Postgres delete failed |

---

### POST /api/documents

Upload a single PDF document. **Updated from P1:** Requires auth, project scoping, and role check.

#### Request

`Content-Type: multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File (PDF) | Yes | The PDF file. Max 20 MB. Must be `application/pdf`. |
| `name` | string | Yes | Display name (1-255 characters). |
| `project_id` | string (UUID) | Yes | **New in P2.** The project this document belongs to. |

#### Processing (in order)

1. `requireAuth()` -- return 401 if no session.
2. Validate that `file` is present and `Content-Type` is `application/pdf`.
3. Validate file size <= 20 MB. Return 413 if exceeded.
4. Validate `name` is non-empty, max 255 characters.
5. Validate `project_id` is a valid UUID.
6. **Role check:** query `project_members` for the user's role in the project. Return 403 if role is not `admin` or `editor`.
7. Get user's `tenant_id` from `profiles`.
8. Read the file into a `Buffer`.
9. `computeBinaryHash(buffer)` -> `binaryHash`.
10. `extractPdfText(buffer)` -> `extractedText`.
11. `computeTextHash(extractedText)` -> `textHash`.
12. Generate storage path: `uploads/{UTC_year}/{project_id}/{uuid}.pdf`.
13. Upload buffer to Supabase Storage bucket `pdf-uploads` using the **user-scoped** client.
14. INSERT into `documents` with `tenant_id`, `project_id`, and `uploaded_by = user.id`.
15. Return 201.

#### Response -- 201 Created

```ts
type UploadResponse = {
  document: Document;
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `MISSING_FILE` | No `file` field in form data |
| 400 | `MISSING_NAME` | `name` missing or empty |
| 400 | `MISSING_PROJECT_ID` | `project_id` missing or empty (NEW in P2) |
| 400 | `NAME_TOO_LONG` | `name` > 255 characters |
| 400 | `INVALID_PROJECT_ID` | `project_id` not a valid UUID (NEW in P2) |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User does not have editor/admin role in this project |
| 413 | `FILE_TOO_LARGE` | File > 20 MB |
| 415 | `INVALID_FILE_TYPE` | File is not `application/pdf` |
| 500 | `STORAGE_ERROR` | Supabase Storage upload failed |
| 500 | `DB_ERROR` | Postgres insert failed |

---

### GET /api/documents

List documents. **Updated from P2:** Requires auth and `project_id` filter.

#### Request

`Content-Type: none` (GET with query parameters)

| Query param | Type | Required | Description |
|---|---|---|---|
| `project_id` | string (UUID) | **Yes (P2)** | Filter documents by project. |
| `search` | string | No | Case-insensitive substring match against `documents.name`. |
| `limit` | number | No | Max results. Default: 50. Max: 200. |
| `offset` | number | No | Rows to skip. Default: 0. |

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `project_id` is a valid UUID. Return 400 if not.
3. Verify user is a member of the project (app-level check for clear 403; RLS also enforces).
4. Query `documents` where `project_id = :project_id`.
5. Apply `search` filter on `name` if provided (ILIKE).
6. Order by `created_at DESC`.
7. Apply `LIMIT` and `OFFSET`.
8. Return the list.

#### Response -- 200 OK

```ts
type ListDocumentsResponse = {
  documents: Document[];
  total: number;   // total matching rows (ignoring limit/offset)
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `MISSING_PROJECT_ID` | `project_id` query param missing |
| 400 | `INVALID_PROJECT_ID` | `project_id` not a valid UUID |
| 400 | `INVALID_LIMIT` | `limit` not a positive integer or exceeds 200 |
| 400 | `INVALID_OFFSET` | `offset` not a non-negative integer |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User is not a member of this project |
| 500 | `DB_ERROR` | Postgres query failed |

---

### GET /api/documents/[id]

Fetch a single document by UUID. **Updated from P1:** Requires auth. RLS enforces access.

#### Request

`Content-Type: none` (GET with path parameter)

| Path param | Type | Required | Description |
|---|---|---|---|
| `id` | string (UUID) | Yes | The document UUID |

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `id` is a valid UUID.
3. Query `documents` where `id = :id`. RLS restricts to documents in projects the user belongs to.
4. Return 404 if no row found (either doesn't exist or user has no access).
5. Return 200.

#### Response -- 200 OK

```ts
type GetDocumentResponse = {
  document: Document;
};
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_ID` | `id` not a valid UUID |
| 401 | `UNAUTHORIZED` | No valid session |
| 404 | `NOT_FOUND` | Document not found or not accessible |
| 500 | `DB_ERROR` | Postgres query failed |

---

### POST /api/documents/bulk

Upload multiple PDF documents to a project in a single request.

#### Request

`Content-Type: multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `files` | File[] (PDF) | Yes | One or more PDF files. Each must be `application/pdf`, max 20 MB. |
| `names` | string (JSON array) | No | JSON array of display names, one per file. If omitted or shorter than files, the original filename is used. |
| `project_id` | string (UUID) | Yes | The project to upload into. |

The `names` field should be a JSON-encoded string array: `["Contract v1", "Amendment A", "Invoice 42"]`.

If `names` is not provided, the `file.name` from each `File` object in the browser is used (with extension stripped). If `names` is provided but has fewer entries than `files`, remaining files use their original filenames.

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate `project_id` is a valid UUID.
3. **Role check:** user must be `admin` or `editor`. Return 403 if not.
4. Validate at least one file is provided. Max 10 files per bulk request. Return 400 if exceeded.
5. For each file, **sequential processing**:
   a. Validate file type and size.
   b. `computeBinaryHash(buffer)`.
   c. `extractPdfText(buffer)`.
   d. `computeTextHash(extractedText)`.
   e. Upload to Storage.
   f. INSERT into `documents`.
   g. Collect result: `{ status: 'ok', document }` or `{ status: 'error', error, code, name }`.
6. Errors on individual files do NOT stop processing. Other files continue.
7. Return 200 with the bulk result (even if some files failed -- check `succeeded` and `failed` counts).

#### Maximums

| Limit | Value |
|---|---|
| Max files per request | 10 |
| Max total request size | 100 MB (application layer check) |
| Max per-file size | 20 MB |

#### Response -- 200 OK

```ts
type BulkUploadResponse = BulkUploadResult;
```

Example:
```json
{
  "project_id": "550e8400-...",
  "results": [
    {
      "status": "ok",
      "document": { "id": "aaa...", "name": "Contract v1", ... },
      "name": "Contract v1"
    },
    {
      "status": "error",
      "error": "File is not a valid PDF",
      "code": "INVALID_FILE_TYPE",
      "name": "notes.txt"
    },
    {
      "status": "ok",
      "document": { "id": "bbb...", "name": "Amendment A", ... },
      "name": "Amendment A"
    }
  ],
  "succeeded": 2,
  "failed": 1
}
```

#### Errors (whole-request failures -- per-file failures are inside `results`)

| Status | `code` | Condition |
|---|---|---|
| 400 | `NO_FILES` | No files provided in the request |
| 400 | `TOO_MANY_FILES` | More than 10 files in the request |
| 400 | `MISSING_PROJECT_ID` | `project_id` missing |
| 400 | `INVALID_PROJECT_ID` | `project_id` not a valid UUID |
| 400 | `INVALID_NAMES` | `names` field is not valid JSON or not an array |
| 401 | `UNAUTHORIZED` | No valid session |
| 403 | `FORBIDDEN` | User does not have editor/admin role |
| 500 | `DB_ERROR` | Postgres operation failed |

Per-file error codes (inside `results[]`): `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `STORAGE_ERROR`, `DB_ERROR`.

---

### POST /api/compare

Compare two documents. **Updated from P1:** Requires auth. Both documents must belong to the same project and the user must have access.

#### Request

`Content-Type: application/json`

```ts
type CompareRequest = {
  docAId: string;  // UUID of first document
  docBId: string;  // UUID of second document
};
```

#### Processing

1. `requireAuth()` -- return 401 if no session.
2. Validate both UUIDs. Return 400 `SAME_DOCUMENT` if equal.
3. Fetch both document records. RLS ensures user has access to both.
4. Return 404 if either is not found (includes "not accessible" cases).
5. **Cross-project check (app layer):** Verify `docA.project_id === docB.project_id`. Return 400 `CROSS_PROJECT_COMPARE` if they differ. Cross-project comparison is not supported in P2.
6. Run the three-step pipeline (identical to P1):
   - **Step 1:** Binary hash check.
   - **Step 2:** Text hash check.
   - **Step 3:** AI compare (only if text hashes differ).
7. Return 200 with the result.

#### DeepSeek API Call (Step 3) -- Unchanged from P1

The prompt construction, API call, and response parsing are identical to P1. See the P1 specification for full details. Summary:

- Endpoint: `POST https://api.deepseek.com/chat/completions`
- Model: `deepseek-chat`
- Response format: `json_object`
- Text truncation at 40,000 characters per document.
- Zod schema validation on AI response (`AIVerdictSchema`).

#### Response -- 200 OK

```ts
type CompareResponse = CompareResult;
```

Example (unchanged from P1):
```json
{
  "docAId": "550e8400-...",
  "docBId": "3f2504e0-...",
  "stage": "AI_COMPARE",
  "verdict": "MATERIAL",
  "confidence": "HIGH",
  "reasoning": "The payment amount in clause 3.1 was changed..."
}
```

#### Errors

| Status | `code` | Condition |
|---|---|---|
| 400 | `INVALID_DOC_A_ID` | `docAId` not a valid UUID |
| 400 | `INVALID_DOC_B_ID` | `docBId` not a valid UUID |
| 400 | `SAME_DOCUMENT` | `docAId` and `docBId` are identical |
| 400 | `CROSS_PROJECT_COMPARE` | Documents belong to different projects (NEW in P2) |
| 401 | `UNAUTHORIZED` | No valid session |
| 404 | `DOC_A_NOT_FOUND` | Document A not found or not accessible |
| 404 | `DOC_B_NOT_FOUND` | Document B not found or not accessible |
| 500 | `DB_ERROR` | Postgres query failed |
| 500 | `AI_API_ERROR` | DeepSeek API call failed |
| 500 | `AI_PARSE_ERROR` | DeepSeek response did not match expected schema |

---

## Auth Endpoints (Supabase-Managed)

P2 does **NOT** create custom auth API routes. Authentication (sign-up, sign-in, sign-out, password reset) is handled entirely by the Supabase browser client calling `supabase.auth.*` methods directly from the frontend. The API routes above consume the resulting session cookie.

**Frontend must implement:**

- **Sign-up flow:** Call `supabase.auth.signUp({ email, password })`. On success, call `POST /api/profile` (not needed -- profile is created automatically via database trigger or the sign-up callback in `lib/auth.ts` using the service-role client).
- **Sign-in flow:** Call `supabase.auth.signInWithPassword({ email, password })`.
- **Sign-out flow:** Call `supabase.auth.signOut()`.
- **Session listener:** Subscribe to `supabase.auth.onAuthStateChange()` in the browser to react to login/logout events and redirect accordingly.

**Profile creation on sign-up:** The backend provides a mechanism (either a database trigger on `auth.users` or application logic via the service-role client) that auto-creates a `profiles` row and a `tenants` row when a new user signs up. The exact implementation (trigger vs. app logic) is a backend agent decision. The architect recommends a **database trigger** for reliability:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_tenant_id uuid;
BEGIN
  INSERT INTO public.tenants (name) VALUES (NEW.email) RETURNING id INTO new_tenant_id;
  INSERT INTO public.profiles (id, tenant_id, display_name)
  VALUES (NEW.id, new_tenant_id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

This trigger is included in the P2 migration (`20260621000001_p2_auth_rbac.sql`) as part of the database contract.

---

## File Storage in Supabase Storage (Updated for P2)

- Files are uploaded using the **user-scoped** client (user's JWT, not the service-role key).
- The bucket name is `pdf-uploads` (private).
- The path format is `uploads/{UTC_year}/{project_id}/{uuid}.pdf`.
- Storage access remains server-side only. No signed URLs or public access.
- The route handler enforces project membership before upload (as a gate before the RLS check).

---

## Environment Variables Used by Route Handlers

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client initialisation (server + client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client initialisation (server + client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin client (profile creation on sign-up, trigger) |
| `DEEPSEEK_API_KEY` | Authorization header for DeepSeek API calls |

No new environment variables are required for P2. The existing variables cover all auth and data access patterns. The `SUPABASE_SERVICE_ROLE_KEY` is now restricted to admin operations only (trigger + any future admin route handlers).

---

## P1 Baseline (Preserved)

All P1 endpoint shapes and the core compare pipeline are preserved. The only P1 endpoints that change behaviour are:

- `POST /api/documents` -- adds `project_id` form field and auth.
- `GET /api/documents` -- `project_id` becomes a required query parameter.
- `GET /api/documents/[id]` -- adds auth (RLS enforces access).
- `POST /api/compare` -- adds auth and cross-project validation.

All other P1 error codes, the CompareResult shape, and the AI prompt contract remain identical.
