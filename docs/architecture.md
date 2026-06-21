# TrustVault -- Architecture (P2)

## Open Decisions

None for P2. All interfaces are fully specified below.

---

## 1. System Overview

TrustVault is a multi-tenant document-integrity platform. In P2 it adds **Supabase Auth for authentication**, **Row Level Security (RLS) for tenant isolation**, **project-based document organisation**, and **role-based access control (admin/editor/viewer)** at the project level. The deployment is still a **Next.js monolith** -- the same application serves both the React UI and all API route handlers.

```
                              ┌─────────────────────┐
                              │   Supabase Auth      │
                              │   (email/password)   │
                              └──────────┬───────────┘
                                         │ JWT session
                                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Browser (React)                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────┐ │
│  │ Auth     │ │ Projects │ │ Upload   │ │ Doc List  │ │ Compare     │ │
│  │ (login/  │ │ CRUD     │ │ (single/ │ │ (search/  │ │ View        │ │
│  │  signup) │ │          │ │  bulk)   │ │  paginate)│ │             │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘ └──────┬──────┘ │
└───────┼────────────┼────────────┼───────────┼──────────────┼──────────┘
        │            │            │           │              │
        │     Supabase JS client (browser)     │              │
        │     or fetch() to /api/*             │              │
        ▼            ▼            ▼           ▼              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Next.js App Router (Vercel)                          │
│                                                                         │
│  middleware.ts  ──── refresh session cookie on every request            │
│                                                                         │
│  lib/auth.ts           ──── createRouteHandlerClient(), requireAuth()  │
│  lib/core.ts           ──── pure functions: hash, extract, prompt       │
│  lib/supabase/client.ts ──── client factory (user-scoped + service-role)│
│                                                                         │
│  app/api/profile/route.ts          GET   /api/profile                  │
│  app/api/projects/route.ts         POST  /api/projects                 │
│                                    GET   /api/projects                 │
│  app/api/projects/[id]/route.ts    GET   /api/projects/:id             │
│                                    PATCH /api/projects/:id             │
│                                    DELETE /api/projects/:id            │
│  app/api/projects/[id]/members/route.ts  GET    /api/projects/:id/members │
│                                          POST   /api/projects/:id/members │
│  app/api/projects/[id]/members/[userId]/route.ts                        │
│                                    PATCH  /api/projects/:id/members/:uid│
│                                    DELETE /api/projects/:id/members/:uid│
│  app/api/documents/route.ts       POST  /api/documents                 │
│                                   GET   /api/documents                 │
│  app/api/documents/bulk/route.ts  POST  /api/documents/bulk            │
│  app/api/documents/[id]/route.ts  GET   /api/documents/:id             │
│  app/api/compare/route.ts         POST  /api/compare                   │
└──────────────────┬──────────────────────┬──────────────────────────────┘
                   │                      │
          ┌────────▼────────┐    ┌────────▼────────────┐
          │  Supabase        │    │  DeepSeek API        │
          │  Postgres (RLS)  │    │  chat/completions    │
          │  Storage (RLS)   │    │  (JSON mode)         │
          │  Auth (users)    │    │  model: deepseek-    │
          └─────────────────┘    │  chat                │
                                 └─────────────────────┘
```

---

## 2. Core Pipeline Invariant

**Unchanged from P1.** The three-step deterministic pipeline (binary hash -> text hash -> AI compare) is an architectural invariant. P2 adds no changes to this pipeline. The pipeline functions in `lib/core.ts` remain pure and auth-agnostic.

```
Step 1: Binary hash  (SHA-256 of raw file bytes)
        |
        v binary hashes equal?
        YES -> return "IDENTICAL"
        NO  v
Step 2: Text hash  (SHA-256 of extracted PDF text)
        |
        v text hashes equal?
        YES -> return "BINARY_DIFF_ONLY"
        NO  v
Step 3: AI compare  (call DeepSeek only here)
        |
        v
        Return verdict: MATERIAL | NOT_MATERIAL + reasoning
```

---

## 3. P2 Architecture Additions

### 3a. Authentication Architecture

TrustVault uses **Supabase Auth** with the `@supabase/ssr` package for Next.js App Router integration. Auth is cookie-based (not bearer-token-in-header).

**Auth flow:**

```
User clicks Sign Up / Sign In (browser)
  |
  v
Supabase JS client (browser) calls supabase.auth.signUp() / signInWithPassword()
  |
  v
Supabase Auth returns session + sets HTTP-only cookie via @supabase/ssr
  |
  v
middleware.ts refreshes the session cookie on every request
  |
  v
API route handler calls createRouteHandlerClient(cookies) + supabase.auth.getUser()
  |
  v
If no user -> 401. If user -> continue with user-scoped Supabase client.
  |
  v
All DB queries go through the user-scoped client.
RLS policies on Postgres use auth.uid() to enforce tenant/project access.
```

**Key architectural rules:**

1. Auth state is managed by Supabase. The application never issues its own tokens.
2. The Supabase session token (JWT) travels in an HTTP-only cookie managed by `@supabase/ssr`. There is no manual token handling in application code.
3. `middleware.ts` runs on every request and calls `supabase.auth.getSession()` to refresh the cookie. It does NOT perform route protection (no redirects) -- it only refreshes the cookie. Route protection happens inside each route handler.
4. The browser Supabase client uses the same `@supabase/ssr` cookie mechanism for client-side auth state.

**Auth provider:** Email/password only in P2. OAuth providers (Google, GitHub) are future scope.

### 3b. Supabase Client Architecture (P2 Critical Decision)

P1 used only the **service-role key** for all server-side Supabase access. P2 introduces a dual-client model:

| Client | Key | Scope | Used for |
|---|---|---|---|
| **User-scoped** | Session JWT (from cookie) | Limited by RLS policies | All user-facing CRUD operations. The user's identity flows through to Postgres so RLS can enforce access. |
| **Service-role** | `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS entirely | Admin-only operations: creating profiles on sign-up, migration tasks, and any operation that must cross tenant boundaries. |

**Client creation pattern** (implemented in `lib/supabase/client.ts`):

```
createRouteHandlerClient()
  -> uses cookie-based session from @supabase/ssr
  -> creates a Supabase client with the user's JWT
  -> returns { supabase, user } (or throws 401 if no session)

createServiceClient()
  -> uses SUPABASE_SERVICE_ROLE_KEY
  -> creates an admin Supabase client that bypasses RLS
  -> only callable from server-side code
  -> must NOT be exposed or passed to client components
```

**Transition rule:** Every API route handler that existed in P1 must switch from the service-role client to the user-scoped client. The service-role client is reserved for `lib/auth.ts` (profile creation on sign-up) and any future admin-only operations. This is a hard rule -- misusing the service-role client silently breaks tenant isolation.

### 3c. Auth Middleware (middleware.ts)

Path: `middleware.ts` (project root, created by `scaffold` or `backend` per conductor direction).

In Next.js App Router with `@supabase/ssr`, the middleware does exactly two things:

1. Calls `supabase.auth.getSession()` to refresh the session cookie if it has expired.
2. Passes the updated cookies through to the response.

The middleware does **NOT**:
- Redirect unauthenticated users (UI handles auth state client-side).
- Check roles or permissions (route handlers do that).
- Protect routes (this is a design choice: API routes return 401, pages check auth in their server component or client-side).

**Why no middleware redirects:** TrustVault is API-heavy. Most pages are server-rendered and fetch data from API routes. Redirecting in middleware creates a brittle coupling between URL structure and auth state. Instead, each page/component checks auth and renders accordingly.

### 3d. Tenant Isolation Architecture

**Hierarchy:** Tenant -> Project -> Document

```
tenants
  └── projects
       └── project_members (RBAC: user + role)
       └── documents
```

- A user belongs to exactly one tenant (stored in `profiles.tenant_id`).
- A project belongs to exactly one tenant.
- A document belongs to exactly one project (and carries `tenant_id` as a denormalised column for RLS efficiency).
- A user's access to a project is governed by their `project_members` row, which includes a role.
- RLS policies on `documents` filter by tenant_id: a user can only see documents in their tenant.
- RLS policies on `projects` filter by project membership.
- RLS policies on `project_members` filter by the user's own membership.

**Why `tenant_id` on documents when it is derivable from project_id:** RLS policies are evaluated per-row. Joining through `projects` on every document query adds a runtime cost. Denormalising `tenant_id` onto `documents` allows a single-column RLS check: `tenant_id = (current_user_tenant_id)`. This is set at insert time and never changes.

**Isolation guarantee:** Even if a route handler has a bug that forgets to filter by project, RLS at the Postgres level prevents any cross-tenant data leakage. Defence in depth: application-level checks + database-level RLS.

### 3e. RBAC Architecture

Three roles defined at the project level (via `project_members.role`):

| Role | Permissions |
|---|---|
| **admin** | Full CRUD on the project. Add/remove members. Delete the project. Upload documents. Trigger compare. |
| **editor** | Upload documents to the project. Trigger compare on documents in the project. Cannot manage members or delete the project. |
| **viewer** | View project details and document list. View document metadata and extracted text. Trigger compare on documents (read-only operation). Cannot upload. |

**Enforcement layers:**
1. **Route handler** checks the user's role before write operations (returns 403 for unauthorised).
2. **RLS policies** on Postgres enforce role checks at the database layer as a second line of defence.
3. **UI** hides actions the user cannot perform (UX, not security).

**Role resolution** in a route handler:
1. Get the user's session (JWT -> `auth.uid()`).
2. Query `project_members` for the user's role in the target project.
3. Check the required role for the operation.
4. If insufficient, return 403.

---

## 4. Updated Data Flows

### 4a. P2 Upload Flow (single document)

Adds auth check and project scoping. Otherwise identical to P1.

```
Browser (authenticated)    API: POST /api/documents       lib/core.ts        Supabase
  |                                |                          |                 |
  |-- multipart/form-data -------->|                          |                 |
  |   (file, name, project_id)     |                          |                 |
  |                                |-- requireAuth() -------->| (cookie)        |
  |                                |<-- user (or 401)  -------|                 |
  |                                |-- check project role ---->| (project_members)|
  |                                |<-- editor/admin (or 403)- |                 |
  |                                |-- computeBinaryHash() --->|                 |
  |                                |<-- binaryHash ------------|                 |
  |                                |-- extractPdfText() ------>|                 |
  |                                |<-- text ------------------|                 |
  |                                |-- computeTextHash() ----->|                 |
  |                                |<-- textHash --------------|                 |
  |                                |-- Storage.upload(file) ---------------->|  (user-scoped)
  |                                |<-- storagePath --------------------------|
  |                                |-- INSERT documents --------------------->|  (user-scoped + RLS)
  |                                |   (tenant_id from user, project_id from req)|
  |                                |<-- document record -----------------------|
  |<-- 201 { document } -----------|                          |                 |
```

### 4b. Bulk Upload Flow

```
Browser (authenticated)    API: POST /api/documents/bulk   lib/core.ts        Supabase
  |                                |                          |                 |
  |-- multipart/form-data -------->|                          |                 |
  |   (files[], names[],           |                          |                 |
  |    project_id)                 |                          |                 |
  |                                |-- requireAuth() + role check               |
  |                                |                          |                 |
  |    For each file (sequential): |                          |                 |
  |      -- computeBinaryHash ----->|                          |                 |
  |      -- extractPdfText -------->|                          |                 |
  |      -- computeTextHash ------->|                          |                 |
  |      -- Storage.upload -------->|                          |                 |
  |      -- INSERT documents ------>|                          |                 |
  |      -- collect result (ok/err) |                          |                 |
  |                                |                          |                 |
  |<-- 200 { results: [{status,    |                          |                 |
  |        document? | error?}] }   |                          |                 |
```

**Error handling for bulk upload:** Each file is processed independently. If file 2 of 5 fails (e.g. invalid type), files 1, 3, 4, 5 still process. The response is an array of per-file results. HTTP status is 200 if at least one file succeeded; the caller inspects each result for errors.

### 4c. Compare Flow

Identical pipeline to P1 with one addition: both document IDs are checked for user access before comparison. RLS on the documents query automatically excludes inaccessible documents. The route handler additionally checks that both documents belong to the same project as a business rule (cross-project comparison is not supported in P2).

---

## 5. Module Responsibilities

### Existing (P1) -- Updated

#### `lib/core.ts`
**Unchanged.** Pure functions. P2 adds no logic here.

#### `app/api/documents/route.ts`
- `POST` -- **Updated:** Requires auth. Accepts `project_id` in form data. Checks user has editor/admin role in project. Sets `tenant_id` from user's profile and `project_id` from request before insert. Uses user-scoped Supabase client.
- `GET` -- **Updated:** Requires auth. Filters by `project_id` query parameter (required). Returns only documents the user is authorised to see (RLS-enforced).

#### `app/api/documents/[id]/route.ts`
- `GET` -- **Updated:** Requires auth. RLS enforces access.

#### `app/api/compare/route.ts`
- `POST` -- **Updated:** Requires auth. Verifies user has access to both documents (RLS-enforced). Additionally checks both documents belong to the same project.

### New (P2)

#### `middleware.ts`
Creates a Supabase server client from the request/response cookies, refreshes the session, and passes updated cookies through. Owned by `backend` or `scaffold` per conductor direction (config file, so likely `scaffold`).

#### `lib/supabase/client.ts`
Exports two factory functions:
- `createRouteHandlerClient()` -- user-scoped client from cookies. Calls `getUser()`. Returns `{ supabase, user }`. Throws 401-like response if no session.
- `createServiceClient()` -- service-role client for admin operations. Uses `SUPABASE_SERVICE_ROLE_KEY`.

#### `lib/auth.ts`
Auth utility functions:
- `requireAuth(request)` -- wraps `createRouteHandlerClient`, returns user or sends 401 response.
- `requireProjectRole(userId, projectId, minRole)` -- checks `project_members` for the user's role in the project, returns the role or sends 403.
- `getUserTenantId(userId)` -- returns the user's `tenant_id` from `profiles`.

#### `lib/types.ts`
TypeScript type definitions shared across the backend:
- `Document` (updated with non-nullable tenant_id, project_id).
- `Project`, `ProjectMember`, `Profile`, `CompareResult` (unchanged).
- `BulkUploadResult`
- `Role = 'admin' | 'editor' | 'viewer'`

#### `app/api/profile/route.ts`
- `GET` -- returns the current user's profile (`id`, `display_name`, `tenant_id`, `created_at`).

#### `app/api/projects/route.ts`
- `POST` -- create a project. User automatically becomes an admin member.
- `GET` -- list projects the user is a member of.

#### `app/api/projects/[id]/route.ts`
- `GET` -- get project details.
- `PATCH` -- update project name/description (admin only).
- `DELETE` -- delete project (admin only).

#### `app/api/projects/[id]/members/route.ts`
- `GET` -- list members of the project.
- `POST` -- add a member to the project (admin only).

#### `app/api/projects/[id]/members/[userId]/route.ts`
- `PATCH` -- update a member's role (admin only).
- `DELETE` -- remove a member from the project (admin only).

#### `app/api/documents/bulk/route.ts`
- `POST` -- bulk upload (see Section 4b).

### UI (frontend -- for reference)

The frontend adds:
- Auth pages (login, signup) -- use Supabase browser client directly.
- Project list page and project detail page.
- Document list scoped to a project.
- Per-document "Compare" button that opens a document selector within the same project.
- Bulk upload UI (multi-file input).
- Auth guard: if no session, redirect to login.

---

## 6. Technology Choices (Updated for P2)

| Choice | Rationale |
|---|---|
| `@supabase/ssr` | Official Supabase package for Next.js App Router. Manages auth cookies server-side and client-side. Required for P2 auth. |
| Supabase Auth (email/password) | Built into Supabase. No separate auth service to manage. Users and sessions live in the same project as data. |
| RLS (Postgres) | Defence-in-depth for tenant isolation. Even if application code has a filtering bug, Postgres rejects cross-tenant reads. |
| Cookie-based sessions | HTTP-only, Secure, SameSite=Lax cookies managed by `@supabase/ssr`. No access tokens exposed to JavaScript. |
| All other P1 choices | Unchanged. |

---

## 7. P1 Baseline (Preserved)

All P1 architecture described in the original document remains valid. The core pipeline, module layout for `lib/core.ts`, technology stack (Next.js, TypeScript, Supabase, DeepSeek, Zod, Vitest), and deployment model (Vercel) are unchanged. P2 adds authentication, tenant isolation, projects, and bulk upload on top of this baseline.

---

## 8. Forward-Compat Notes for P3 / P4

- P3 (Documentation & Demo): No architecture changes anticipated. The existing system should be demo-ready after P2. A narrative demo script may need seed data.
- P4 (Blockchain Anchoring): The `documents` table should add a `proof_hash` and `anchor_tx` column. The compare flow should expose the proof. No structural changes to auth or project model needed.
- OAuth providers (Google, GitHub): Supabase Auth supports them natively. Adding them is a configuration change, not an architecture change. Not in P2 scope.

---

## 9. Out of Scope for P2

- OAuth providers (email/password only)
- Per-document RBAC (roles are at project level only)
- Cross-project document comparison
- Document deletion (P1 had none, P2 adds project deletion but not document deletion)
- Rate limiting on API routes (left to deployment layer)
- Audit logging of user actions
- OCR / scanned document support (beyond P1 scope)

---

## 10. Handoff

Build sequence for P2 -- must run in this order:

| Step | Agent | Picks up | Runs |
|---|---|---|---|
| 0 | `scaffold` | `docs/architecture.md` (Section 5 for module map, note `@supabase/ssr` dependency), `CLAUDE.md` (stack) | **Sequential, alone.** Updates the shared project skeleton: adds `@supabase/ssr` dependency, creates/updates `middleware.ts`, ensures auth-related env vars are in `.env.local` template. |
| 1 | `database` | `docs/database.md` -> create `supabase/migrations/` for P2 tables, RLS policies | **Parallel** with backend + frontend (after scaffold done) |
| 1 | `backend` | `docs/api-spec.md` + `docs/database.md` + `docs/architecture.md` -> implement `lib/auth.ts`, `lib/supabase/client.ts`, `lib/types.ts` updates, all P2 route handlers, update P1 handlers for auth | **Parallel** with database + frontend |
| 1 | `frontend` | `docs/api-spec.md` + `docs/architecture.md` -> build auth pages, project CRUD UI, project-scoped document list, bulk upload UI, per-document compare | **Parallel** with database + backend |
| 2 | `qa` | `docs/roadmap.md` P2 acceptance criteria -> verify, write tests, evaluate auth flows | **Sequential** after build (gate) |
| 2 | `security` | `docs/security.md` -> audit auth, RLS, tenant isolation | **Sequential** after build (gate, read-only) |
| 3 | `deployment` | `docs/deployment.md` -> update CI config, Vercel env vars, Supabase Auth configuration | **Last**, after gates pass |

**Critical rules (unchanged from P1):**
- `scaffold` is a serial prerequisite. No build agent may start before the skeleton exists and compiles.
- `database`, `backend`, and `frontend` run in parallel. They share contracts (`database.md` for schema, `api-spec.md` for API shape) and must not deviate.
- File ownership matrix in `CLAUDE.md` applies. If a build agent needs a file owned by another agent, it flags the need to the conductor.
- `scripts/verify.sh` (eslint + tsc --noEmit + vitest run) must pass before QA/Security review.

**New for P2:** The `scaffold` agent must add `@supabase/ssr` to `package.json` dependencies. The `backend` agent creates `middleware.ts` (this is a config/boundary file -- if conductor prefers, `scaffold` creates the skeleton and `backend` fills it). The conductor must resolve this before spawning agents.

Open questions for the human: none for P2 -- all interfaces are fully specified.
