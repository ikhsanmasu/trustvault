# TrustVault -- Architecture (P5)

## Open Decisions

None for P5. All interfaces are fully specified below.

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

## 8. Forward-Compat Notes for P5 / P6

- P5 (Blockchain Anchoring): **Now implemented.** See Section 11 for the full architecture. The design differs from the original roadmap (no Merkle trees in P5; one fingerprint per document anchored directly). Batching and Merkle trees are deferred to a future phase.
- P6 (AI Vault Assistant): RAG-based conversational AI. Requires vector embeddings and a chat interface. No architecture changes to P5 anchoring expected.
- OAuth providers (Google, GitHub): Supabase Auth supports them natively. Adding them is a configuration change, not an architecture change. Not in current scope.

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

---

## 11. P5 Blockchain Anchoring Architecture

### 11a. P5 System Overview

P5 adds a **blockchain anchoring layer** that proves document integrity via an on-chain fingerprint registry. The system now has three domains:

```
                              ┌──────────────────────────────────────┐
                              │   EVM Blockchain (Anvil/Sepolia/...)  │
                              │   ┌────────────────────────────────┐  │
                              │   │  TrustVaultAnchor (Solidity)    │  │
                              │   │  mapping(bytes32 => uint256)    │  │
                              │   │  anchor() / verify()            │  │
                              │   └────────────────────────────────┘  │
                              └──────────────┬───────────────────────┘
                                             │ RPC calls (viem)
                                             │ Server-side only
                      ┌──────────────────────┴──────────────────────────┐
                      │           Next.js App Router (Vercel)           │
                      │                                                 │
                      │  lib/anchor.ts                                  │
                      │  ├── computeFingerprint(binaryHash, textHash)   │
                      │  ├── AnchorService interface                    │
                      │  ├── EvmAnchorService (viem implementation)     │
                      │  └── getAnchorService() factory                 │
                      │                                                 │
                      │  app/api/anchor/route.ts   POST /api/anchor     │
                      │  app/api/verify/route.ts   POST /api/verify     │
                      └──────────────┬──────────────────────────────────┘
                                     │
                            Supabase Postgres
                            documents table
                            + fingerprint, chain, tx_hash, anchored_at
```

**Key architectural rule -- Do not touch the hashing pipeline:**

P5 consumes `binary_hash` and `text_hash` from existing document records. It NEVER modifies `lib/core.ts` or the upload/compare pipeline. The existing hashing pipeline is an architectural invariant; P5 is a consumer, not a modifier.

### 11b. Fingerprint Pipeline (New Architectural Invariant)

The fingerprint computation is deterministic and must produce the same result off-chain (viem/TypeScript) and on-chain (Solidity). This is the cryptographic guarantee that enables independent verification.

```
Document record in DB:
  binary_hash (64-char hex, SHA-256 of raw file)
  text_hash   (64-char hex, SHA-256 of extracted text)
        |
        v
  computeFingerprint(binaryHash, textHash)
        |
        v
  keccak256(abi.encodePacked(binaryHashAsBytes32, textHashAsBytes32))
        |
        v
  fingerprint (32 bytes, stored as 0x-prefixed hex = 66 chars)
```

**Contract:** This computation is entirely deterministic. Given the same two hashes, it always produces the same fingerprint. There are no salts, nonces, or random components.

### 11c. Anchor Flow (Server-Side)

```
Browser (authenticated)    API: POST /api/anchor       lib/anchor.ts       Smart Contract
  |                                |                        |                    |
  |-- { documentId } ------------->|                        |                    |
  |                                |-- requireAuth() ------>| (cookie)           |
  |                                |<-- user (or 401) ------|                    |
  |                                |-- fetch document ------>| (Supabase, RLS)   |
  |                                |<-- doc (or 404) --------|                    |
  |                                |-- check: fingerprint    |                    |
  |                                |   already set?          |                    |
  |                                |   YES -> 409 ALREADY_   |                    |
  |                                |          ANCHORED       |                    |
  |                                |-- computeFingerprint() ->|                    |
  |                                |<-- fingerprint ----------|                    |
  |                                |-- getAnchorService() --->|                    |
  |                                |<-- service --------------|                    |
  |                                |-- service.anchor(fp) --->|                    |
  |                                |                          |-- simulateContract |
  |                                |                          |<-- ok / revert     |
  |                                |                          |-- writeContract --->|
  |                                |                          |   emit Anchored    |
  |                                |                          |<-- txHash ---------|
  |                                |                          |-- waitForReceipt ->|
  |                                |                          |<-- receipt --------|
  |                                |<-- { txHash, anchoredAt }|                    |
  |                                |-- UPDATE documents ------>| (Supabase, RLS)   |
  |                                |   SET fingerprint, chain, |                    |
  |                                |       tx_hash, anchored_at|                    |
  |                                |<-- ok --------------------|                    |
  |<-- 201 { anchorResult } -------|                        |                    |
```

**Critical rule:** The anchor transaction is signed server-side with `ANCHOR_PRIVATE_KEY`. The private key never leaves the Next.js server. The browser never sees it.

### 11d. Verify Flow (Server-Side)

```
Browser (authenticated)    API: POST /api/verify       lib/anchor.ts       Smart Contract
  |                                |                        |                    |
  |-- { documentId } ------------->|                        |                    |
  |                                |-- requireAuth() ------>| (cookie)           |
  |                                |-- fetch document ------>| (Supabase, RLS)   |
  |                                |<-- doc (or 404) --------|                    |
  |                                |-- computeFingerprint() ->|                    |
  |                                |   from current DB hashes |                    |
  |                                |<-- recomputedFp ---------|                    |
  |                                |                          |                    |
  |                                |-- CASE: doc.fingerprint  |                    |
  |                                |   is NULL:               |                    |
  |                                |   return { intact: false,|                    |
  |                                |     reason: "not_        |                    |
  |                                |     anchored" }          |                    |
  |                                |                          |                    |
  |                                |-- CASE: recomputedFp !=  |                    |
  |                                |   doc.fingerprint:       |                    |
  |                                |   return { intact: false,|                    |
  |                                |     reason: "hash_       |                    |
  |                                |     mismatch" }          |                    |
  |                                |                          |                    |
  |                                |-- CASE: recomputedFp ==  |                    |
  |                                |   doc.fingerprint:       |                    |
  |                                |   service.verify(fp) --->|                    |
  |                                |                          |-- readContract --->|
  |                                |                          |<-- timestamp ------|
  |                                |<-- { found, anchoredAt } |                    |
  |                                |                          |                    |
  |                                |   IF found: intact=true; |                    |
  |                                |   IF not found: intact=  |                    |
  |                                |     false, reason=       |                    |
  |                                |     "not_on_chain"       |                    |
  |                                |                          |                    |
  |<-- 200 { verifyResult } -------|                        |                    |
```

### 11e. P5 Module Responsibilities

#### New Modules (owned by `backend`)

**`lib/anchor.ts`** -- Blockchain anchoring logic:
- `computeFingerprint(binaryHash, textHash)` -- pure function, uses viem `keccak256` + `encodePacked`.
- `AnchorService` interface -- `anchor(fp)` and `verify(fp)`.
- `EvmAnchorService` class -- viem implementation: public client for reads, wallet client for transactions.
- `getAnchorService()` factory -- reads `ANCHOR_*` env vars, returns configured service.
- `createSigner(privateKey)` -- wraps `privateKeyToAccount` from viem. **TODO (prod): replace with KMS.**

**`app/api/anchor/route.ts`** -- `POST /api/anchor`:
- Requires auth + project membership (same pattern as existing endpoints).
- Fetches document by ID.
- Returns 409 if already anchored.
- Computes fingerprint, calls `anchorService.anchor()`, updates DB.
- Returns 201 with `AnchorResponse`.

**`app/api/verify/route.ts`** -- `POST /api/verify`:
- Requires auth + project membership.
- Fetches document, recomputes fingerprint, checks against stored + on-chain.
- Returns 200 with `VerifyResponse`.

#### Updated Modules

**`lib/types.ts`** -- Add P5 types:
- `AnchorRequest`, `AnchorResponse`, `VerifyRequest`, `VerifyResponse`.
- Update `Document` interface: add `fingerprint?`, `chain?`, `tx_hash?`, `anchored_at?` (all nullable -- only set after anchoring).

#### New Modules (owned by `deployment`)

**`contracts/TrustVaultAnchor.sol`** -- Smart contract (see `docs/blockchain.md`).

**`scripts/deploy-anchor.ts`** -- Contract deployment script using viem.

**`docker/anvil.Dockerfile`** -- Anvil Dockerfile for Railway deployment.

#### New Modules (owned by `frontend`)

**Anchor button + modal in vault rows** -- Shield icon on each document row. Opens modal showing fingerprint, chain info, tx hash, anchored timestamp, verification status, block explorer link.

#### Updated Modules (owned by `database`)

**Migration `20260622000000_p5_blockchain_anchor.sql`** -- Adds four columns + unique constraint + index to `documents` table.

### 11f. Technology Choices (P5)

| Choice | Rationale |
|---|---|
| `viem` (not ethers) | Lighter, tree-shakeable, first-class TypeScript support. Required by project spec. |
| `abi.encodePacked` + `keccak256` | Standard Solidity pattern. `abi.encodePacked` tight-packs the two bytes32 values (64 bytes total), then keccak256 hashes to one bytes32. Identical behavior in viem and Solidity. |
| Smart contract: mapping, not array | O(1) lookup by fingerprint. No iteration needed. Gas-efficient. |
| `require(anchoredAt[fingerprint] == 0)` | Enforces immutability at contract level. No admin key can overwrite. |
| `block.timestamp` (not `block.number`) | Portable across chains with different block times. Sufficient for "existed before time T" proofs. |
| Anvil for local dev | Instant blocks, prefunded accounts, zero config. Far simpler than connecting to a public testnet for daily development. |
| Solidity ^0.8.20 | Modern, uses built-in overflow protection. Compatible with latest Foundry/Hardhat tooling. |
| `ANCHOR_PRIVATE_KEY` env var (not a wallet file) | Simplest deployment model for P5. KMS planned for production. |

### 11g. Environment Variables (P5)

| Variable | Scope | Description |
|---|---|---|
| `ANCHOR_RPC_URL` | Server-only | JSON-RPC endpoint URL (e.g., `http://127.0.0.1:8545` for Anvil) |
| `ANCHOR_CHAIN_ID` | Server-only | EVM chain ID (e.g., `31337` for Anvil, `11155111` for Sepolia) |
| `ANCHOR_CONTRACT_ADDRESS` | Server-only | Deployed `TrustVaultAnchor` contract address (`0x`-prefixed) |
| `ANCHOR_PRIVATE_KEY` | Server-only | Private key for signing anchor transactions (`0x`-prefixed, 64 hex chars). **Never prefixed with `NEXT_PUBLIC_`** |

### 11h. Forward Compatibility

- **Merkle batching:** The `AnchorService` interface abstracts the anchoring mechanism. A future `MerkleAnchorService` can implement the same interface, batching multiple fingerprints into one Merkle root transaction. The smart contract remains unchanged.
- **Async queues:** The synchronous anchor flow can be replaced by an async queue without changing the API route signature. Add an `anchor_status` column to documents (`pending | confirmed | failed`).
- **Multi-chain:** Add an `anchor_entries` child table to anchor one document on multiple chains. The current single-chain design is a deliberate simplification for P5.
- **KMS signing:** The `createSigner()` factory is the single point of change for upgrading to KMS-based signing.

---

## 12. Handoff (P5)

Build sequence for P5 -- must run in this order:

| Step | Agent | Picks up | Runs |
|---|---|---|---|
| 0 | `scaffold` | `docs/architecture.md` (Sections 11e-11g), `docs/blockchain.md`, `CLAUDE.md` (stack) | **Sequential, alone.** Adds `viem` dependency to `package.json`. No other config changes needed. |
| 1 | `database` | `docs/database.md` Section 11 -> create migration `20260622000000_p5_blockchain_anchor.sql` | **Parallel** with backend + frontend (after scaffold done) |
| 1 | `backend` | `docs/api-spec.md` P5 endpoints + `docs/blockchain.md` + `docs/database.md` -> implement `lib/anchor.ts` (fingerprint + AnchorService), `app/api/anchor/route.ts`, `app/api/verify/route.ts`, update `lib/types.ts` | **Parallel** with database + frontend |
| 1 | `frontend` | `docs/api-spec.md` P5 endpoints + `docs/blockchain.md` -> anchor button (shield icon) on vault rows, anchor modal, explorer link logic | **Parallel** with database + backend |
| 2 | `qa` | `docs/roadmap.md` P5 acceptance criteria -> write eval tests for anchoring + verify flows, fingerprint computation | **Sequential** after build (gate) |
| 2 | `security` | `docs/security.md` P5 section -> audit private key handling, server-side-only execution, env var exposure, replay protection | **Sequential** after build (gate, read-only) |
| 3 | `deployment` | `docs/deployment.md` P5 section + `docs/blockchain.md` -> create `contracts/TrustVaultAnchor.sol`, `scripts/deploy-anchor.ts`, `docker/anvil.Dockerfile`, update CI, add Vercel env vars for P5 | **Last**, after gates pass |

**Critical rules:**
- `scaffold` is a serial prerequisite. No build agent may start before the skeleton exists and compiles with `viem` added.
- `database`, `backend`, and `frontend` run in parallel. They share contracts (`database.md` for schema, `api-spec.md` for API shape, `blockchain.md` for fingerprint formula) and must not deviate.
- File ownership matrix in `CLAUDE.md` applies. New ownership for P5:
  - `deployment` owns `contracts/`, `scripts/deploy-anchor.ts`, `docker/anvil.Dockerfile`
  - `backend` owns `lib/anchor.ts`, `app/api/anchor/`, `app/api/verify/`
  - `frontend` owns anchor UI components
  - `database` owns the P5 migration file
- `ANCHOR_PRIVATE_KEY` must never appear in client-side code or env vars with `NEXT_PUBLIC_` prefix.
- `scripts/verify.sh` (eslint + tsc --noEmit + vitest run) must pass before QA/Security review.
- The existing hashing pipeline (`lib/core.ts`) is NOT modified by any agent. P5 is a consumer only.

Open questions for the human: none for P5 -- all interfaces are fully specified.
