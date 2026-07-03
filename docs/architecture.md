# TrustVault -- Architecture (P5)

## Open Decisions

None for P5. All interfaces are fully specified below.

---

## 1. System Overview

TrustVault is a multi-tenant document-integrity platform. It adds **Supabase Auth for authentication**, **Row Level Security (RLS) for tenant isolation**, and **tenant-level role-based access control (owner/admin/editor/viewer)** via `profiles.role`. The deployment is a **Next.js monolith** -- the same application serves both the React UI and all API route handlers.

```
                              ┌─────────────────────┐
                              │   Supabase Auth      │
                              │   (email/password)   │
                              └──────────┬───────────┘
                                         │ JWT session
                                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Browser (React)                               │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────┐ │
│  │ Auth     │ │ Upload   │ │ Doc List  │ │ Compare     │ │
│  │ (login/  │ │ (single/ │ │ (search/  │ │ View        │ │
│  │  signup) │ │  bulk)   │ │  paginate)│ │             │ │
│  └────┬─────┘ └────┬─────┘ └─────┬─────┘ └──────┬──────┘ │
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
│  app/api/tenant/members/route.ts   GET   /api/tenant/members           │
│  app/api/tenant/invite/route.ts    POST  /api/tenant/invite            │
│  app/api/tenant/join/route.ts      GET   /api/tenant/join              │
│  app/api/documents/route.ts       POST  /api/documents                 │
│                                   GET   /api/documents                 │
│  app/api/documents/bulk/route.ts  POST  /api/documents/bulk            │
│  app/api/documents/[id]/route.ts  GET   /api/documents/:id             │
│  app/api/compare/route.ts         POST  /api/compare                   │
│  app/api/anchor/route.ts          POST  /api/anchor                    │
│  app/api/verify/route.ts          POST  /api/verify                    │
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
RLS policies on Postgres use auth.uid() to enforce tenant access.
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

**Hierarchy:** Tenant -> Document

```
tenants
  └── documents
```

- A user belongs to exactly one tenant (stored in `profiles.tenant_id`).
- A document belongs to exactly one tenant (via `documents.tenant_id`).
- A user's access to documents is governed by their tenant membership and `profiles.role`.
- RLS policies on `documents` filter by tenant_id: a user can only see documents in their tenant.
- Documents are organised via labels (see P14 label management).

**Why `tenant_id` on documents:** RLS policies are evaluated per-row. The `tenant_id` column allows a single-column RLS check: `tenant_id = (current_user_tenant_id)`. This is set at insert time and never changes.

**Isolation guarantee:** Even if a route handler has a bug that forgets to filter by tenant, RLS at the Postgres level prevents any cross-tenant data leakage. Defence in depth: application-level checks + database-level RLS.

### 3e. RBAC Architecture

Four roles defined at the tenant level (via `profiles.role`):

| Role | Permissions |
|---|---|
| **owner** | Full CRUD on the tenant. Manage members (invite, remove, change roles). Delete the tenant. Upload documents. Trigger compare. Anchor documents. |
| **admin** | Full CRUD on tenant resources. Manage members except owner. Cannot delete the tenant. |
| **editor** | Upload documents, soft-delete, trigger compare, anchor documents, manage labels. Cannot manage members. |
| **viewer** | View documents, trigger compare, verify documents. Read-only access. |

**Enforcement layers:**
1. **Route handler** checks the user's role via `requireTenantRole(userId, allowedRoles)` before write operations (returns 403 for unauthorised).
2. **RLS policies** on Postgres enforce role checks at the database layer as a second line of defence.
3. **UI** hides actions the user cannot perform (UX, not security).

**Role resolution** in a route handler:
1. Get the user's session (JWT -> `auth.uid()`).
2. Query `profiles` for the user's `role` and `tenant_id`.
3. Check the required role for the operation.
4. If insufficient, return 403.

---

## 4. Updated Data Flows

### 4a. P2 Upload Flow (single document)

Adds auth check and tenant scoping. Otherwise identical to P1.

```
Browser (authenticated)    API: POST /api/documents       lib/core.ts        Supabase
  |                                |                          |                 |
  |-- multipart/form-data -------->|                          |                 |
  |   (file, name)                 |                          |                 |
  |                                |-- requireAuth() -------->| (cookie)        |
  |                                |<-- user (or 401)  -------|                 |
  |                                |-- requireTenantRole ----->| (profiles)      |
  |                                |<-- owner/admin/editor     |                 |
  |                                |   (or 403)               |                 |
  |                                |-- computeBinaryHash() --->|                 |
  |                                |<-- binaryHash ------------|                 |
  |                                |-- extractPdfText() ------>|                 |
  |                                |<-- text ------------------|                 |
  |                                |-- computeTextHash() ----->|                 |
  |                                |<-- textHash --------------|                 |
  |                                |-- Storage.upload(file) ---------------->|  (user-scoped)
  |                                |<-- storagePath --------------------------|
  |                                |-- INSERT documents --------------------->|  (user-scoped + RLS)
  |                                |   (tenant_id from user)                  |
  |                                |<-- document record -----------------------|
  |<-- 201 { document } -----------|                          |                 |
```

### 4b. Bulk Upload Flow

```
Browser (authenticated)    API: POST /api/documents/bulk   lib/core.ts        Supabase
  |                                |                          |                 |
  |-- multipart/form-data -------->|                          |                 |
  |   (files[], names[])           |                          |                 |
  |                                |-- requireAuth() + requireTenantRole()      |
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

Identical pipeline to P1 with one addition: both document IDs are checked for user access before comparison. RLS on the documents query automatically excludes inaccessible documents. The route handler additionally checks that both documents belong to the same tenant (cross-tenant comparison is not supported).

---

## 5. Module Responsibilities

### Existing (P1) -- Updated

#### `lib/core.ts`
**Unchanged.** Pure functions. P2 adds no logic here.

#### `app/api/documents/route.ts`
- `POST` -- **Updated:** Requires auth. Checks user has editor/admin/owner role via `requireTenantRole()`. Sets `tenant_id` from user's profile before insert. Uses user-scoped Supabase client.
- `GET` -- **Updated:** Requires auth. Filters by user's `tenant_id`. Returns only documents the user is authorised to see (RLS-enforced).

#### `app/api/documents/[id]/route.ts`
- `GET` -- **Updated:** Requires auth. RLS enforces access.

#### `app/api/compare/route.ts`
- `POST` -- **Updated:** Requires auth. Verifies user has access to both documents (RLS-enforced). Additionally checks both documents belong to the same tenant.

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
- `requireTenantRole(userId, allowedRoles)` -- checks `profiles.role` for the user's tenant-level role, returns the role and tenant_id or sends 403.
- `getUserTenantId(userId)` -- returns the user's `tenant_id` from `profiles`.

#### `lib/types.ts`
TypeScript type definitions shared across the backend:
- `Document` (with non-nullable tenant_id).
- `Profile`, `CompareResult` (unchanged).
- `BulkUploadResult`
- `TenantRole = 'owner' | 'admin' | 'editor' | 'viewer'`

#### `app/api/profile/route.ts`
- `GET` -- returns the current user's profile (`id`, `display_name`, `tenant_id`, `role`, `created_at`).

#### `app/api/tenant/members/route.ts`
- `GET` -- list members of the tenant (admin/owner only).

#### `app/api/tenant/invite/route.ts`
- `POST` -- invite a new member to the tenant (admin/owner only).

#### `app/api/tenant/join/route.ts`
- `GET` -- accept an invitation to join a tenant (any authenticated user).

#### `app/api/documents/bulk/route.ts`
- `POST` -- bulk upload (see Section 4b).

### UI (frontend -- for reference)

The frontend adds:
- Auth pages (login, signup) -- use Supabase browser client directly.
- Document list scoped to the user's tenant.
- Per-document "Compare" button that opens a document selector within the same tenant.
- Bulk upload UI (multi-file input).
- Tenant members management screen with role badges, invite form, and pending invitations.
- Auth guard: if no session, redirect to login.

---

## 6. Technology Choices (Updated for P2)

| Choice | Rationale |
|---|---|
| `@supabase/ssr` | Official Supabase package for Next.js App Router. Manages auth cookies server-side and client-side. Required for P2 auth. |
| Supabase Auth (email/password) | Built into Supabase. No separate auth service to manage. Users and sessions live in the same platform as data. |
| RLS (Postgres) | Defence-in-depth for tenant isolation. Even if application code has a filtering bug, Postgres rejects cross-tenant reads. |
| Cookie-based sessions | HTTP-only, Secure, SameSite=Lax cookies managed by `@supabase/ssr`. No access tokens exposed to JavaScript. |
| All other P1 choices | Unchanged. |

---

## 7. P1 Baseline (Preserved)

All P1 architecture described in the original document remains valid. The core pipeline, module layout for `lib/core.ts`, technology stack (Next.js, TypeScript, Supabase, DeepSeek, Zod, Vitest), and deployment model (Vercel) are unchanged. P2 adds authentication, tenant isolation, and bulk upload on top of this baseline.

---

## 8. Forward-Compat Notes for P5 / P6

- P5 (Blockchain Anchoring): **Now implemented.** See Section 11 for the full architecture. The design differs from the original roadmap (no Merkle trees in P5; one fingerprint per document anchored directly). Batching and Merkle trees are deferred to a future phase.
- P6 (AI Vault Assistant): RAG-based conversational AI. Requires vector embeddings and a chat interface. No architecture changes to P5 anchoring expected.
- OAuth providers (Google, GitHub): Supabase Auth supports them natively. Adding them is a configuration change, not an architecture change. Not in current scope.

---

## 9. Out of Scope for P2

- OAuth providers (email/password only)
- Per-document RBAC (roles are at tenant level)
- Cross-tenant document comparison
- Document deletion (P1 had none, P2 adds soft delete in P4)
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
| 1 | `frontend` | `docs/api-spec.md` + `docs/architecture.md` -> build auth pages, tenant-scoped document list, bulk upload UI, per-document compare, tenant members management | **Parallel** with database + backend |
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
- Requires auth + tenant membership (same pattern as existing endpoints).
- Fetches document by ID.
- Returns 409 if already anchored.
- Computes fingerprint, calls `anchorService.anchor()`, updates DB.
- Returns 201 with `AnchorResponse`.

**`app/api/verify/route.ts`** -- `POST /api/verify`:
- Requires auth + tenant membership.
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

---

## 13. P14 Tenant-Level RBAC + Invitations Architecture

### 13a. RBAC Model Shift

P12 removed the projects layer and project-level RBAC (`project_members` table). P14 introduces **tenant-level RBAC** via a `role` column on `profiles` and an **invitation system** for onboarding new members. Every user who belongs to a tenant has exactly one role within that tenant.

This replaces the P2 project-level admin/editor/viewer model. The authorization primitive changes from `requireProjectRole(userId, projectId, minRole)` to `requireTenantRole(userId, tenantId, allowedRoles)`. All existing route handlers that previously checked project-level roles must be updated to use the tenant-level check.

### 13b. Role Definitions

Four roles, defined at the tenant level via `profiles.role`:

| Role | Description | How assigned |
|------|-------------|--------------|
| **owner** | The user who created the tenant. Exactly one per tenant. Cannot be demoted, removed, or have their role changed. Full control over all tenant resources including deletion. | Automatically on sign-up via the `handle_new_user` trigger. Cannot be assigned via invitation. |
| **admin** | Full CRUD on all tenant resources. Can manage members (invite, remove, change roles) except the owner. Cannot delete the tenant. | Assigned by owner or another admin via invitation or direct role change. |
| **editor** | Can upload documents, soft-delete documents, trigger compare, anchor documents, manage labels, and run AI ingest. Cannot manage members or tenant settings. | Assigned by owner or admin via invitation or direct role change. Default role for new invited members who need write access. |
| **viewer** | Read-only access. Can view documents, trigger compare, verify documents, run AI chat. Cannot upload, delete, modify, anchor, or ingest. | Default role for new profiles (column default). Assigned when no write access is needed. |

### 13c. Permission Matrix

| Action | owner | admin | editor | viewer |
|--------|-------|-------|--------|--------|
| Upload documents (POST /api/documents) | Yes | Yes | Yes | No |
| View documents (GET /api/documents) | Yes | Yes | Yes | Yes |
| Compare documents (POST /api/compare) | Yes | Yes | Yes | Yes |
| Soft-delete documents (PATCH /api/documents/[id]) | Yes | Yes | Yes | No |
| Anchor documents (POST /api/anchor) | Yes | Yes | Yes | No |
| Verify documents (POST /api/verify) | Yes | Yes | Yes | Yes |
| AI Assistant chat (POST /api/assistant/chat) | Yes | Yes | Yes | Yes |
| AI Ingest documents (POST /api/assistant/ingest) | Yes | Yes | Yes | No |
| Manage labels (CRUD labels, attach/detach) | Yes | Yes | Yes | No |
| Create/revoke share links | Yes | Yes | Yes | Yes |
| View tenant members (GET /api/tenant/members) | Yes | Yes | No | No |
| Invite new members (POST /api/tenant/invite) | Yes | Yes | No | No |
| Change member roles (PATCH /api/tenant/members/[userId]) | Yes | Yes (not owner) | No | No |
| Remove members (DELETE /api/tenant/members/[userId]) | Yes | Yes (not owner) | No | No |
| Revoke invitations (DELETE invitation) | Yes | Yes | No | No |
| Delete tenant | Yes | No | No | No |

### 13d. Invitation Flow

The invitation system allows admins and owners to invite new members by email. The invitee does not need an existing account -- they can sign up after receiving the invitation.

```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐     ┌──────────────┐
│  Admin/Owner │     │  Next.js API  │     │  Supabase    │     │  Invitee     │
│  (browser)   │     │  /api/tenant  │     │  Postgres    │     │  (email)     │
└──────┬───────┘     └───────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                     │                     │                     │
       │ POST /invite        │                     │                     │
       │ {email, role}       │                     │                     │
       │────────────────────>│                     │                     │
       │                     │ requireTenantRole   │                     │
       │                     │ (admin+)            │                     │
       │                     │                     │                     │
       │                     │ generate token      │                     │
       │                     │ (crypto.randomBytes │                     │
       │                     │  32 -> hex, 64 chars│                     │
       │                     │                     │                     │
       │                     │ DELETE old pending  │                     │
       │                     │ for same email      │                     │
       │                     │────────────────────>│                     │
       │                     │                     │                     │
       │                     │ INSERT invitations  │                     │
       │                     │ (tenant_id, email,  │                     │
       │                     │  role, token,       │                     │
       │                     │  created_by,        │                     │
       │                     │  expires_at=now+7d) │                     │
       │                     │────────────────────>│                     │
       │                     │<────────────────────│                     │
       │                     │                     │                     │
       │                     │ (email service sends│                     │
       │                     │ link with token)    │                     │
       │<── 201 {invitation} │                     │                     │
       │                     │                     │                     │
       │                     │                     │  (invitee clicks    │
       │                     │                     │   email link,       │
       │                     │                     │   signs up if new,  │
       │                     │                     │   logs in if exist) │
       │                     │                     │                     │
       │                     │ GET /join?token=xxx │                     │
       │                     │<─────────────────────────────────────────│
       │                     │                     │                     │
       │                     │ requireAuth()       │                     │
       │                     │ (any authenticated  │                     │
       │                     │  user -- no tenant  │                     │
       │                     │  membership needed) │                     │
       │                     │                     │                     │
       │                     │ Look up token:      │                     │
       │                     │ - EXISTS?           │                     │
       │                     │ - accepted_at=NULL? │                     │
       │                     │ - expires_at>now()? │                     │
       │                     │                     │                     │
       │                     │ Match email:        │                     │
       │                     │ LOWER(auth.user     │                     │
       │                     │   .email) =         │                     │
       │                     │ LOWER(invitation    │                     │
       │                     │   .email)            │                     │
       │                     │                     │                     │
       │                     │ Check target user   │                     │
       │                     │ is NOT already in   │                     │
       │                     │ a tenant            │                     │
       │                     │                     │                     │
       │                     │ UPDATE profiles     │                     │
       │                     │ SET tenant_id, role │                     │
       │                     │────────────────────>│                     │
       │                     │                     │                     │
       │                     │ UPDATE invitations  │                     │
       │                     │ SET accepted_at     │                     │
       │                     │ (using service_role │                     │
       │                     │  client -- user     │                     │
       │                     │  has no tenant yet) │                     │
       │                     │────────────────────>│                     │
       │                     │                     │                     │
       │ 200 { tenant_id,    │                     │                     │
       │   role }            │                     │                     │
       │──────────────────────────────────────────────────────────────>│
```

**Invitation rules:**
1. Token is 64-char hex: `crypto.randomBytes(32).toString('hex')`.
2. Token expires after 7 days (`expires_at` column checked on accept).
3. Token is single-use: once `accepted_at` is set, the invitation is consumed.
4. If a pending invitation already exists for the same `(tenant_id, email)`, the old one is deleted before inserting the new one (at most one pending invitation per email per tenant).
5. The invitee must be authenticated (any session is valid -- no prior tenant membership needed).
6. The authenticated user's email must match the invitation email (case-insensitive `LOWER()` comparison).
7. The target user must not already belong to a tenant.
8. The owner role cannot be granted via invitation.

### 13e. requireTenantRole() Helper Pattern

Replaces the P2 `requireProjectRole()` pattern. Located in `lib/auth.ts`. Since projects no longer exist (dropped P12), all authorization checks now use the user's tenant-level role from `profiles.role`.

**Signature (pseudocode):**

```
async function requireTenantRole(
  supabase: SupabaseClient,
  userId: string,
  allowedRoles: TenantRole[]
): Promise<{ role: TenantRole; tenantId: string }>
```

**Logic (pseudocode):**

1. Query `profiles` where `id = userId`.
2. If no profile, return 403 `FORBIDDEN` (no tenant membership).
3. If `profile.role` is not in `allowedRoles`, return 403 `FORBIDDEN` (insufficient role).
4. Return `{ role: profile.role, tenantId: profile.tenant_id }`.

**Usage in route handlers:**

```ts
// Example: protecting POST /api/documents
const { user } = await requireAuth();
const { tenantId } = await requireTenantRole(supabase, user.id, ['owner', 'admin', 'editor']);
// ... proceed with tenantId scoped query
```

**Route handler pattern migration:**
All endpoints that previously called `requireProjectRole(userId, projectId, minRole)` must be updated to call `requireTenantRole(userId, allowedRoles)`. The tenant ID is always obtained from the user's profile -- it is never accepted from the request body.

### 13f. Module Responsibilities (P14)

#### New Modules (owned by `backend`)

**`app/api/tenant/members/route.ts`** -- `GET /api/tenant/members`:
- Requires auth + admin/owner role.
- Lists all profiles in the calling user's tenant with their roles.
- Supports `?search=` query param for filtering by display_name or email.
- Response includes `members: { id, display_name, role, created_at }[]` and `total`.

**`app/api/tenant/members/[userId]/route.ts`** -- `PATCH` and `DELETE`:
- `PATCH` -- Update a member's role (admin/owner only).
  - Cannot change the owner's role.
  - Cannot promote anyone to owner.
  - Self-demotion check: if caller demotes themselves and they are the last admin/owner, block with `LAST_ADMIN`.
- `DELETE` -- Remove a member from the tenant (admin/owner only).
  - Cannot remove the owner.
  - Self-removal check: if caller removes themselves and they are the last admin/owner, block with `LAST_ADMIN`.
  - Resets the removed user's `profiles.tenant_id` to NULL and `profiles.role` to `'viewer'` (they retain their account but lose tenant access).

**`app/api/tenant/invite/route.ts`** -- `POST /api/tenant/invite`:
- Requires auth + admin/owner role.
- Validates `email` and `role` (cannot be `'owner'`).
- If a pending invitation already exists for this `(tenant_id, email)`, deletes it first.
- Generates token, inserts invitation row.
- Sends invitation email (via email service or logs token in dev).

**`app/api/tenant/join/route.ts`** -- `GET /api/tenant/join`:
- Requires auth (any authenticated user -- no tenant membership required).
- Validates `token` query parameter.
- Looks up invitation: must exist, not expired, not already accepted.
- Matches authenticated user's email to invitation email (case-insensitive).
- Verifies the user does not already belong to a tenant.
- Updates `profiles.tenant_id` and `profiles.role` for the accepting user.
- Sets `invitations.accepted_at`.
- Returns `{ tenant_id, role }`.

#### Updated Modules

**`lib/auth.ts`** -- Add `requireTenantRole()` function. Deprecate and remove `requireProjectRole()`.

**`lib/types.ts`** -- Add/update P14 types:
- `TenantRole = 'owner' | 'admin' | 'editor' | 'viewer'`
- Update `Profile` type: add `role: TenantRole`
- Add `TenantMember`, `Invitation`, `InviteRequest`, `UpdateMemberRoleRequest`, `JoinResponse` types.

**All existing route handlers** -- Replace `requireProjectRole()` calls with `requireTenantRole()`. The minimum role per endpoint:

| Endpoint | Minimum Role | Notes |
|----------|-------------|-------|
| `POST /api/documents` | editor | Upload requires write access |
| `POST /api/documents/bulk` | editor | Bulk upload requires write access |
| `PATCH /api/documents/[id]` | editor | Soft-delete/restore requires write access |
| `POST /api/anchor` | editor | Anchoring modifies DB + sends tx |
| `POST /api/assistant/ingest` | editor | Ingestion creates chunks in DB |
| `POST /api/compare` | viewer | Read-only operation |
| `POST /api/verify` | viewer | Read-only verification |
| `POST /api/assistant/chat` | viewer | Read-only chat |
| `GET /api/assistant/sessions` | viewer | Read-only session list |
| `DELETE /api/assistant/sessions/[id]` | viewer | User deletes own session only |

**`supabase/migrations/`** -- New migration file `20260703000000_p14_rbac_invitations.sql` (see `database.md` Section 13 for full SQL).

#### New Modules (owned by `frontend`)

**Tenant members management screen** -- Accessible from the Settings page (`app/(dashboard)/settings/`):
- Members list with name, email, role badge, and "joined" date.
- Role dropdown (admin/owner only) to change roles. Owner's role is not editable.
- Remove member button (admin/owner only). Owner row has no remove button.
- Invite member form: email input + role dropdown (admin/editor/viewer).
- Pending invitations list with status (pending/expired) and revoke button.
- Toast notifications for success/error on all actions.

### 13g. Technology Choices (P14)

| Choice | Rationale |
|--------|-----------|
| `crypto.randomBytes(32).toString('hex')` for invitation tokens | Node.js built-in, zero dependencies. 256 bits of entropy is sufficient for invitation tokens. Hex encoding creates a 64-character URL-safe token. |
| 7-day invitation expiry | Standard SaaS practice. Long enough for email delivery and user response, short enough to limit exposure of dangling invitations. |
| Role on `profiles`, not a separate membership table | Since projects are gone (P12), each user has exactly one role per tenant. A column on profiles is simpler and more performant than a separate membership table with a join. |
| `owner` as a role, not a separate column | Simplifies authorization checks: `allowedRoles.includes(profile.role)`. The owner is just a role with special protections (cannot be demoted, removed, or changed). |
| No owner via invitation | Prevents privilege escalation. Only the sign-up flow (or a future admin transfer mechanism) can create an owner. |
| Service-role client for join endpoint acceptance | The accepting user does not yet have `tenant_id` set, so user-scoped RLS on `invitations` would block the UPDATE to set `accepted_at`. The route handler uses a service-role client for this specific operation only. |

---

## 14. Handoff (P14)

Build sequence for P14 -- must run in this order:

| Step | Agent | Picks up | Runs |
|------|-------|----------|------|
| 0 | `scaffold` | `docs/architecture.md` (Section 13f for module map), `CLAUDE.md` (stack) | **Sequential, alone.** No new dependencies needed for P14 (no new npm packages). Verify existing skeleton compiles. |
| 1 | `database` | `docs/database.md` Section 13 -> create migration `20260703000000_p14_rbac_invitations.sql` | **Parallel** with backend + frontend (after scaffold done) |
| 1 | `backend` | `docs/api-spec.md` P14 endpoints + `docs/database.md` Section 13 + `docs/architecture.md` Section 13 -> implement `requireTenantRole()` in `lib/auth.ts`, update `lib/types.ts`, create all P14 route handlers (`app/api/tenant/`), update all existing route handlers to use `requireTenantRole()`, update `handle_new_user` trigger in migration | **Parallel** with database + frontend |
| 1 | `frontend` | `docs/api-spec.md` P14 endpoints + `docs/architecture.md` Section 13d (invitation flow), 13f (settings page) -> build tenant members management screen in Settings, invite form, pending invitations list, role badges, member remove/role-change controls | **Parallel** with database + backend |
| 2 | `qa` | `docs/roadmap.md` P14 acceptance criteria -> write eval tests for RBAC enforcement, role gating on endpoints, invitation flow, owner protection | **Sequential** after build (gate) |
| 2 | `security` | `docs/security.md` Section 15 -> audit role enforcement (route handler + RLS), invitation token security, owner immutability, last-admin protection, service-role usage in join endpoint | **Sequential** after build (gate, read-only) |
| 3 | `deployment` | `docs/deployment.md` -> update migration list, verify new migration applies, add invitation email config if needed | **Last**, after gates pass |

**Critical rules:**
- `scaffold` is a serial prerequisite. No build agent may start before the skeleton exists and compiles.
- `database`, `backend`, and `frontend` run in parallel. They share contracts (`database.md` Section 13 for schema, `api-spec.md` P14 for API shape) and must not deviate.
- File ownership matrix in `CLAUDE.md` applies:
  - `database` owns the P14 migration file (`supabase/migrations/20260703000000_p14_rbac_invitations.sql`)
  - `backend` owns `lib/auth.ts` (add `requireTenantRole`), `app/api/tenant/`, `lib/types.ts` (P14 type additions), and updates to all existing route handlers
  - `frontend` owns the Settings > Members page and all invitation-related UI components
  - No agent modifies files owned by another agent
- The `requireProjectRole()` function must not be called after P14 -- all route handlers must use `requireTenantRole()`.
- The service-role client may only be used in `GET /api/tenant/join` for updating the `invitations.accepted_at` column. All other invitation operations use the user-scoped client.
- `scripts/verify.sh` (eslint + tsc --noEmit + vitest run) must pass before QA/Security review.

Open questions for the human: none for P14 -- all interfaces are fully specified.

---

## 15. P16 Agent System Architecture

### 15a. Overview

P16 adds a **custom AI agent** subsystem. Users create named agents, each with a configurable system prompt (persona) and a selected set of knowledge-base documents. Agents can connect to external messaging channels (WhatsApp via QR scan, Telegram via bot token) and have a playground chat for testing.

The agent system builds on existing infrastructure:
- **P6 RAG pipeline** for document retrieval (reuses `document_chunks` table and embedding generation).
- **P2 auth and RBAC** for access control (tenant scoping, role gates).
- **P6 SSE streaming pattern** for chat responses.

The agent is pinned at **P16** (not P15) because it introduces significant new subsystems: Puppeteer-based WhatsApp Web client, Telegram Bot API integration, channel credential encryption, and a new set of database tables.

### 15b. Agent System Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Browser (React)                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌──────────────────────┐   │
│  │ Agent List   │ │ Agent Editor │ │ Playground    │ │ Channel Manager      │   │
│  │ (create,     │ │ (name,       │ │ Chat (SSE,    │ │ (WhatsApp QR,        │   │
│  │  list,       │ │  prompt,     │ │  RAG-scoped  │ │  Telegram connect,   │   │
│  │  delete)     │ │  docs)       │ │  to agent)   │ │  status poll)        │   │
│  └──────┬───────┘ └──────┬───────┘ └───────┬───────┘ └──────────┬───────────┘   │
└─────────┼────────────────┼─────────────────┼─────────────────────┼───────────────┘
          │                │                  │                     │
          │  fetch() to /api/agents/*         │                     │
          ▼                ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Next.js App Router (Vercel)                              │
│                                                                                  │
│  lib/agents/                                                                     │
│  ├── channel-manager.ts    — WhatsApp client pool, Telegram bot registry,       │
│  │                           channel lifecycle (start/stop/disconnect)           │
│  ├── channel-encryption.ts — AES-256-GCM encrypt/decrypt for channel configs     │
│  ├── rag.ts                — Agent-scoped RAG pipeline (queries agent_documents │
│  │                           to filter document_chunks to selected docs)         │
│  └── whatsapp-handler.ts   — WhatsApp message event handler (incoming messages, │
│                              RAG pipeline, reply)                                │
│                                                                                  │
│  app/api/agents/route.ts                    POST /api/agents                     │
│                                            GET  /api/agents                     │
│  app/api/agents/[id]/route.ts              GET  /api/agents/:id                  │
│                                            PATCH /api/agents/:id                 │
│                                            DELETE /api/agents/:id                │
│  app/api/agents/[id]/channels/route.ts     POST /api/agents/:id/channels        │
│  app/api/agents/[id]/channels/[channelId]/route.ts  DELETE .../channels/:chanId │
│  app/api/agents/[id]/chat/route.ts         POST /api/agents/:id/chat            │
│  app/api/agents/[id]/chat/sessions/route.ts GET /api/agents/:id/chat/sessions   │
│  app/api/agents/[id]/chat/sessions/[sid]/route.ts GET|DELETE .../sessions/:sid  │
│  app/api/agents/[id]/whatsapp/connect/route.ts  POST /api/agents/:id/whatsapp/connect │
│  app/api/agents/[id]/whatsapp/disconnect/route.ts POST .../whatsapp/disconnect  │
│  app/api/agents/[id]/whatsapp/status/route.ts  GET /api/agents/:id/whatsapp/status │
│  app/api/agents/[id]/telegram/connect/route.ts  POST .../telegram/connect       │
│  app/api/agents/[id]/telegram/disconnect/route.ts POST .../telegram/disconnect  │
│  app/api/webhook/telegram/[agentId]/route.ts  POST /api/webhook/telegram/:agentId │
│  app/api/webhook/whatsapp/[agentId]/route.ts   POST /api/webhook/whatsapp/:agentId │
└──────────────────┬──────────────────────┬────────────────────────────────────────┘
                   │                      │
          ┌────────▼────────┐    ┌────────▼────────────┐
          │  Supabase        │    │  DeepSeek API        │
          │  Postgres (RLS)  │    │  chat/completions    │
          │  Storage          │    │  (stream: true)      │
          │  pgvector         │    │  model: deepseek-chat │
          └─────────────────┘    ├──────────────────────┤
                                 │  OpenAI API           │
                                 │  embeddings           │
                                 │  text-embedding-3-    │
                                 │  small (1536d)        │
                                 └──────────────────────┘
                                         │
          ┌──────────────────────────────┴──────────────────────────┐
          │              External Messaging Channels                 │
          │                                                          │
          │  ┌─────────────────────────┐  ┌──────────────────────┐  │
          │  │ WhatsApp Web (Puppeteer)│  │ Telegram Bot API     │  │
          │  │ whatsapp-web.js         │  │ node-telegram-bot-   │  │
          │  │ - QR code auth          │  │ api                  │  │
          │  │ - message events        │  │ - webhook receiver   │  │
          │  │ - sendMessage()         │  │ - sendMessage()      │  │
          │  └─────────────────────────┘  └──────────────────────┘  │
          └─────────────────────────────────────────────────────────┘
```

### 15c. Agent Lifecycle

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  Create  │────>│  Configure   │────>│  Connect     │────>│  Deploy  │
│          │     │              │     │  Channels    │     │          │
│  POST    │     │  PATCH       │     │  POST        │     │  Agent   │
│  /api/   │     │  /api/agents │     │  .../channels│     │  responds│
│  agents  │     │  /:id        │     │  .../connect │     │  to chats│
│          │     │              │     │              │     │  & msgs  │
│  - name  │     │  - system_   │     │  WhatsApp:   │     │          │
│  - system│     │    prompt    │     │    QR scan   │     │  Play-   │
│    prompt│     │  - knowledge │     │    flow      │     │  ground   │
│  - docs  │     │    base docs│     │  Telegram:   │     │  chat at  │
│          │     │  - is_active│     │    bot token │     │  any point│
│          │     │              │     │              │     │          │
└──────────┘     └──────────────┘     └──────────────┘     └──────────┘
```

- **Create:** Agent is created with a name, system prompt, and an initial set of knowledge-base documents.
- **Configure:** Name, prompt, documents, and active status can be updated at any time via PATCH.
- **Connect Channels:** Channels are added and then connected. WhatsApp requires a QR scan flow; Telegram requires a bot token.
- **Deploy/Active:** Once channels are connected, the agent responds to messages on those channels and in the playground.
- **Playground chat** is available at any point after creation (no channel needed).
- **Deactivate:** Setting `is_active = false` stops channel responses. Playground chat still works. Individual channels can also be disconnected without deleting them.

### 15d. WhatsApp Integration Flow

Uses `whatsapp-web.js` -- an unofficial WhatsApp Web client based on Puppeteer. This requires a persistent Puppeteer browser instance on the server.

#### Connection Flow

```
User (Browser)              Next.js Server                    WhatsApp Web
     │                           │                                │
     │ POST /whatsapp/connect    │                                │
     │──────────────────────────>│                                │
     │                           │── Create WhatsApp Client ──>  │
     │                           │   (Puppeteer launches)        │
     │<── 200 { status:'qr_      │                                │
     │     pending' }            │                                │
     │                           │                                │
     │ GET /whatsapp/status      │                                │
     │ (poll every 2s)           │                                │
     │──────────────────────────>│                                │
     │                           │<── 'qr' event ────────────────│
     │<── 200 { status:          │   (QR string captured)        │
     │     'qr_pending',         │                                │
     │     qr_code: '...'}       │                                │
     │                           │                                │
     │ [User scans QR with       │                                │
     │  WhatsApp mobile app]     │                                │
     │                           │                                │
     │ GET /whatsapp/status      │                                │
     │──────────────────────────>│                                │
     │                           │<── 'ready' event ─────────────│
     │<── 200 { status:          │   (authenticated)              │
     │     'connected',          │── Update DB: is_active=true   │
     │     phone_number: '...'}  │── Persist session state       │
     │                           │                                │
     │ [Agent is now connected]  │                                │
```

#### Incoming Message Flow

```
WhatsApp Web                    Next.js Server                   DeepSeek
     │                               │                              │
     │── 'message' event ──────────>│                              │
     │   { from, body, ... }        │                              │
     │                               │── Find agent by client       │
     │                               │── Create/find session        │
     │                               │── Insert user message        │
     │                               │── RAG pipeline (agent docs)  │
     │                               │── Build prompt (system_      │
     │                               │   prompt + context)          │
     │                               │── DeepSeek chat/completions ─>│
     │                               │<── streaming response ───────│
     │                               │── Insert assistant message   │
     │                               │── Send reply via WhatsApp ──>│
     │<── "Based on your documents, │                              │
     │     the payment terms..."    │                              │
```

**Critical design decision:** WhatsApp replies are sent AFTER the full AI response is received (not streamed). WhatsApp Web does not support streaming partial messages; the full text is sent as one message via `client.sendMessage()`.

#### Persistent Client State

WhatsApp Web sessions are stateful. The `whatsapp-web.js` library can serialize and restore session state, avoiding QR re-scan on server restart. The session state is stored in the encrypted `config` column of `agent_channels`:

- On `ready` event: serialize client session state, encrypt, store in `config.client_state`.
- On server startup (or connect): check if `config.client_state` exists. If yes, restore session instead of showing QR. If the session is expired, clear it and start fresh QR flow.
- On `disconnected` event: clear `config.client_state`, set `is_active = false`.

**Puppeteer requirements:** The server environment must support Chromium/Chrome. In production (Vercel), this means using `@sparticuz/chromium` or deploying the WhatsApp client as a separate service. For P16, the recommended approach is:

- **Local dev:** Puppeteer launches a local Chrome/Chromium instance.
- **Production:** Deploy the WhatsApp client as a separate Node.js process (e.g., a Railway service or a dedicated VPS) that connects to the same Supabase database. The Next.js API routes communicate with this service via HTTP or shared database state.

This split is documented but the architecture supports both modes via a swappable `WhatsAppClientProvider` interface in `lib/agents/channel-manager.ts`.

### 15e. Telegram Integration Flow

Uses `node-telegram-bot-api` -- the official Node.js library for the Telegram Bot API. Telegram bots use webhooks (preferred for production) or long-polling.

#### Connection Flow

```
User (Browser)              Next.js Server                    Telegram API
     │                           │                                │
     │ POST /telegram/connect    │                                │
     │ { bot_token }             │                                │
     │──────────────────────────>│                                │
     │                           │── getMe(bot_token) ───────────>│
     │                           │<── { username: '@mybot' } ─────│
     │                           │                                │
     │                           │── Encrypt bot_token            │
     │                           │── setWebhook(url=/api/         │
     │                           │   webhook/telegram/:agentId) >│
     │                           │<── ok ──────────────────────── │
     │                           │                                │
     │                           │── Register bot in global       │
     │                           │   registry (agentId -> bot)    │
     │                           │── Update DB: is_active=true     │
     │                           │                                │
     │<── 200 { bot_username,    │                                │
     │     webhook_url }         │                                │
```

#### Incoming Message Flow

```
Telegram User              Telegram API              Next.js Server
     │                           │                        │
     │─ "Hello bot" ────────────>│                        │
     │                           │── POST /api/webhook/   │
     │                           │   telegram/:agentId    │
     │                           │───────────────────────>│
     │                           │                        │── Validate agentId
     │                           │                        │── Parse update
     │                           │                        │── Find/create session
     │                           │                        │── Insert user message
     │                           │                        │── RAG pipeline
     │                           │                        │── DeepSeek chat
     │                           │                        │── Insert assistant msg
     │                           │<── 200 { ok: true } ───│
     │                           │                        │
     │                           │── sendMessage() ──────>│
     │                           │                        │── POST to Telegram API
     │                           │<───────────────────────│
     │<── "Based on your docs..."│                        │
```

**Telegram webhook auth:** The `X-Telegram-Bot-Api-Secret-Token` header is used for webhook verification. This token is set via the `TELEGRAM_WEBHOOK_SECRET` env var and included in the `setWebhook` call as `secret_token`. The webhook endpoint verifies this header on every incoming request.

### 15f. Channel Abstraction Pattern

Channels are managed through a unified `ChannelManager` in `lib/agents/channel-manager.ts`. This decouples the API routes from specific channel implementations:

```ts
// lib/agents/channel-manager.ts -- conceptual interface (pseudocode)

interface ChannelHandler {
  connect(agentId: string, config: ChannelConfig): Promise<ConnectResult>;
  disconnect(agentId: string): Promise<void>;
  getStatus(agentId: string): ChannelStatus;
  handleIncomingMessage(agentId: string, message: IncomingMessage): Promise<void>;
}

class ChannelManager {
  private whatsAppHandlers: Map<string, WhatsAppHandler>;
  private telegramHandlers: Map<string, TelegramHandler>;

  getHandler(channelType: 'whatsapp' | 'telegram'): ChannelHandler;
  registerAgent(agentId: string, channelType: string, handler: ChannelHandler): void;
  unregisterAgent(agentId: string, channelType: string): void;

  // WhatsApp status is polled by the frontend, so the handler
  // holds in-memory state (qr_code, status, phone_number)
  getWhatsAppStatus(agentId: string): WhatsAppStatus;
}
```

**WhatsApp client pool:** Each connected WhatsApp agent runs its own `whatsapp-web.js` Client instance (with its own Puppeteer page). These are stored in an in-memory Map keyed by `agentId`. The `ChannelManager` singleton manages their lifecycle.

**Telegram bot registry:** Each connected Telegram agent has a `node-telegram-bot-api` instance. The webhook endpoint (`POST /api/webhook/telegram/[agentId]`) looks up the agent by its UUID path parameter, retrieves the bot instance from the registry, and processes the update.

### 15g. Playground Chat Architecture

The playground chat (`POST /api/agents/[id]/chat`) reuses the same SSE streaming pattern as the P6 assistant chat. The key architectural difference is the RAG scope:

| Aspect | P6 Assistant | P16 Agent Playground |
|---|---|---|
| **System prompt** | Fixed: "You are TrustVault AI Assistant..." | Agent's `system_prompt` |
| **RAG scope** | All documents in tenant | Only documents linked via `agent_documents` |
| **Session storage** | `chat_sessions` + `chat_messages` | `agent_sessions` + `agent_messages` |
| **Citation source** | `document_chunks` filtered by tenant | `document_chunks` filtered to agent's `document_ids` |

The agent scoping requires an additional JOIN in the RAG retrieval query:

```sql
-- Agent-scoped RAG retrieval (pseudocode)
SELECT dc.*
FROM public.document_chunks dc
JOIN public.agent_documents ad ON dc.document_id = ad.document_id
WHERE ad.agent_id = :agentId
ORDER BY dc.embedding <=> :queryEmbedding
LIMIT 5;
```

### 15h. Module Responsibilities (P16)

#### New Modules (owned by `backend`)

**`lib/agents/channel-manager.ts`** -- Singleton managing all channel connections:
- In-memory Maps: `whatsappClients` (agentId -> WhatsApp Client), `telegramBots` (agentId -> Telegram Bot).
- `initWhatsApp(agentId, config)`, `destroyWhatsApp(agentId)`.
- `initTelegram(agentId, config)`, `destroyTelegram(agentId)`.
- `getWhatsAppStatus(agentId)`, `getTelegramStatus(agentId)`.
- Handles session persistence (serialize/restore WhatsApp state).

**`lib/agents/channel-encryption.ts`** -- AES-256-GCM encryption for channel credentials:
- `encryptConfig(plaintext: AgentChannelConfig): string` -- encrypts the config as a base64-encoded ciphertext.
- `decryptConfig(ciphertext: string): AgentChannelConfig` -- decrypts.
- Uses `AGENT_CHANNEL_ENCRYPTION_KEY` env var. Falls back to a dev-only warning if missing.
- Algorithm: AES-256-GCM with random 12-byte IV. Output format: `iv:ciphertext:authTag` (all base64-encoded).

**`lib/agents/rag.ts`** -- Agent-scoped RAG pipeline:
- `retrieveContext(agentId: string, query: string): Promise<DocumentChunk[]>` -- embeds query, searches chunks filtered to agent's documents.
- `buildPrompt(systemPrompt: string, context: DocumentChunk[], history: AgentMessage[], question: string): ChatMessage[]` -- builds the messages array for DeepSeek.

**`lib/agents/whatsapp-handler.ts`** -- WhatsApp message event handler:
- `handleIncomingMessage(agentId: string, msg: WhatsAppMessage): Promise<void>` -- called from the 'message' event.
- Creates/finds session, inserts messages, runs RAG, sends reply.

**`lib/agents/telegram-handler.ts`** -- Telegram update handler:
- `handleUpdate(agentId: string, update: TelegramUpdate): Promise<void>` -- called from webhook.
- Same flow as WhatsApp handler.

**`app/api/agents/route.ts`** -- `POST` and `GET` for `/api/agents`.

**`app/api/agents/[id]/route.ts`** -- `GET`, `PATCH`, `DELETE` for `/api/agents/:id`.

**`app/api/agents/[id]/channels/route.ts`** -- `POST /api/agents/:id/channels`.

**`app/api/agents/[id]/channels/[channelId]/route.ts`** -- `DELETE`.

**`app/api/agents/[id]/chat/route.ts`** -- `POST /api/agents/:id/chat` (SSE).

**`app/api/agents/[id]/chat/sessions/route.ts`** -- `GET` list sessions.

**`app/api/agents/[id]/chat/sessions/[sessionId]/route.ts`** -- `GET` and `DELETE` session.

**`app/api/agents/[id]/whatsapp/connect/route.ts`** -- `POST` start connect flow.

**`app/api/agents/[id]/whatsapp/disconnect/route.ts`** -- `POST` disconnect.

**`app/api/agents/[id]/whatsapp/status/route.ts`** -- `GET` poll status.

**`app/api/agents/[id]/telegram/connect/route.ts`** -- `POST` connect.

**`app/api/agents/[id]/telegram/disconnect/route.ts`** -- `POST` disconnect.

**`app/api/webhook/telegram/[agentId]/route.ts`** -- `POST` receive Telegram updates.

**`app/api/webhook/whatsapp/[agentId]/route.ts`** -- `POST` (placeholder for future WhatsApp Business API).

#### Updated Modules

**`lib/types.ts`** -- Add P16 types:
- `Agent`, `AgentWithDetails`, `AgentChannel`, `AgentSession`, `AgentMessage`.
- `CreateAgentRequest`, `UpdateAgentRequest`, `AddChannelRequest`.
- `WhatsAppConnectResponse`, `WhatsAppStatusResponse`.
- `TelegramConnectRequest`, `TelegramConnectResponse`.
- `AgentChatRequest`.

#### New Modules (owned by `frontend`)

**Agent list page** -- New sidebar menu item "Agents" linking to `app/(dashboard)/agents/`:
- Grid/list of agents with name, status badge (active/inactive), channel icons.
- "Create Agent" button opens a modal with name, system prompt, and document selector.
- Clicking an agent opens the agent detail page.

**Agent detail/editor page** -- `app/(dashboard)/agents/[id]/`:
- Edit name, system prompt, knowledge-base document selector.
- Toggle active/inactive.
- Channel management section: add/connect/disconnect WhatsApp and Telegram.
- Link to playground chat.

**Agent playground chat** -- `app/(dashboard)/agents/[id]/chat/`:
- Reuses the chat UI pattern from P6 Assistant.
- Session sidebar showing past conversations.
- SSE streaming response display.

**WhatsApp QR modal** -- Overlay showing the QR code for scanning:
- Polls `GET /api/agents/[id]/whatsapp/status` every 2 seconds.
- Renders QR code using client-side library (`qrcode.react`).
- Shows status transitions: "Waiting for QR..." -> "Scan QR code" -> "Connecting..." -> "Connected!"

**Channel connection UI** -- Forms for connecting channels:
- WhatsApp: "Connect WhatsApp" button -> opens QR modal.
- Telegram: input field for bot token + "Connect" button.
- Disconnect buttons with confirmation.

#### New Modules (owned by `database`)

**Migration `20260703000002_p16_agents.sql`** -- Creates five tables + indexes + RLS policies (see `database.md` Section 14).

### 15i. Technology Choices (P16)

| Choice | Rationale |
|---|---|
| `whatsapp-web.js` | Most mature unofficial WhatsApp Web client for Node.js. Puppeteer-based. Free (no WhatsApp Business API fees). QR code scan authentication. Handles message sending/receiving. |
| `node-telegram-bot-api` | Official Node.js wrapper for Telegram Bot API. Supports webhooks and long-polling. Lightweight, well-maintained. |
| `qrcode.react` (frontend) | Client-side QR code rendering. No server dependency needed for QR image generation. The WhatsApp QR string is rendered directly in the browser. |
| AES-256-GCM for channel config encryption | Industry-standard authenticated encryption. Protects bot tokens and session state at rest in the database. Key never leaves the server. |
| Separate `agent_sessions` and `agent_messages` tables | Agent chat has different scoping (agent + user), different columns (channel, external_user_id), and different RLS semantics than P6 assistant chat. A separate table avoids schema compromises. |
| In-memory WhatsApp client pool | WhatsApp Web sessions are long-lived and stateful. An in-memory Map keyed by agentId provides O(1) lookup. Server restarts require reconnection (mitigated by session persistence in `config.client_state`). |
| Webhook-based Telegram integration | More efficient than long-polling for production. One HTTP request per message instead of persistent polling. Requires a public URL (Vercel provides this). |

### 15j. Environment Variables (P16)

| Variable | Scope | Description |
|---|---|---|
| `AGENT_CHANNEL_ENCRYPTION_KEY` | Server-only | 32-byte base64-encoded AES-256 key for encrypting channel configs. Generate via: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |
| `APP_URL` | Server-only | Public URL of the deployed app (e.g., `https://trustvault.vercel.app`). Used to construct Telegram webhook URLs. |
| `TELEGRAM_WEBHOOK_SECRET` | Server-only | (Optional) Secret token for Telegram webhook verification. Set in `setWebhook` as `secret_token`. |
| `WHATSAPP_WEBHOOK_SECRET` | Server-only | (Future) Secret for WhatsApp Business API webhook validation. Not used in P16. |

### 15k. New npm Dependencies

| Package | Version | Purpose |
|---|---|---|
| `whatsapp-web.js` | ^1.25.x (latest) | WhatsApp Web client (Puppeteer-based) |
| `node-telegram-bot-api` | ^0.66.x (latest) | Telegram Bot API client |
| `qrcode.react` | ^4.x (latest) | Client-side QR code rendering (frontend). Can also use `qrcode` (server) for SVG generation. |

The `scaffold` agent must add these three packages to `package.json`.

### 15l. Forward Compatibility

- **WhatsApp Business API migration:** The `ChannelHandler` interface abstracts the channel implementation. Replacing `whatsapp-web.js` with the official WhatsApp Business API only requires a new handler implementation. The webhook endpoint (`POST /api/webhook/whatsapp/[agentId]`) is already defined.
- **Additional channels (Slack, Discord, etc.):** Adding a new channel type requires:
  1. Adding the channel_type to the CHECK constraint (requires a new migration).
  2. Implementing a new `ChannelHandler`.
  3. Adding a new connect/disconnect API route pair.
- **Per-channel system prompt overrides:** Future enhancement: allow channel-specific system prompt overrides stored in `agent_channels.config`.
- **Agent-to-agent handoff:** Future: one agent can hand off a conversation to another agent. Requires cross-agent session linking in `agent_messages`.
- **WhatsApp as a separate service:** The architecture supports splitting the WhatsApp client into a separate Node.js process (e.g., Railway service). The `WhatsAppClientProvider` interface in `channel-manager.ts` can be swapped from in-process Puppeteer to an HTTP-based remote client.

### 15m. Out of Scope for P16

- Multi-agent conversations (agent handoff).
- Channel-specific system prompt overrides.
- Agent usage analytics / message count tracking.
- WhatsApp Business API (official) integration.
- Slack, Discord, or other channel types.
- Agent templates or cloning.
- Scheduled/cron-triggered agent messages.
- OAuth-based channel authentication flows.

---

## 16. Handoff (P16)

Build sequence for P16 -- must run in this order:

| Step | Agent | Picks up | Runs |
|---|---|---|---|
| 0 | `scaffold` | `docs/architecture.md` (Section 15k for new npm dependencies), `CLAUDE.md` (stack) | **Sequential, alone.** Adds `whatsapp-web.js`, `node-telegram-bot-api`, and `qrcode.react` to `package.json`. Verifies skeleton compiles. |
| 1 | `database` | `docs/database.md` Section 14 -> create migration `20260703000002_p16_agents.sql` | **Parallel** with backend + frontend (after scaffold done) |
| 1 | `backend` | `docs/api-spec.md` P16 endpoints + `docs/database.md` Section 14 + `docs/architecture.md` Section 15 -> implement `lib/agents/` (channel-manager, channel-encryption, rag, whatsapp-handler, telegram-handler), all P16 route handlers, update `lib/types.ts` | **Parallel** with database + frontend |
| 1 | `frontend` | `docs/api-spec.md` P16 endpoints + `docs/architecture.md` Section 15h (frontend modules) -> build agent list page, agent editor/detail page, agent playground chat, WhatsApp QR modal, channel connection UI, new "Agents" sidebar menu item | **Parallel** with database + backend |
| 2 | `qa` | `docs/roadmap.md` P16 acceptance criteria -> write eval tests for agent CRUD, agent chat RAG scoping, channel config encryption, WhatsApp connect/disconnect flow, Telegram webhook handling | **Sequential** after build (gate) |
| 2 | `security` | `docs/security.md` Section 16 -> audit channel credential encryption, webhook verification, rate limiting per agent, knowledge base access control, WhatsApp session state security, Telegram bot token handling | **Sequential** after build (gate, read-only) |
| 3 | `deployment` | `docs/deployment.md` P16 section -> add `AGENT_CHANNEL_ENCRYPTION_KEY` and other new env vars to Vercel, verify new migration, configure Puppeteer/Chromium for production WhatsApp client, configure Telegram webhook public URL | **Last**, after gates pass |

**Critical rules:**
- `scaffold` is a serial prerequisite. No build agent may start before the skeleton exists and compiles with new P16 dependencies.
- `database`, `backend`, and `frontend` run in parallel. They share contracts (`database.md` Section 14 for schema, `api-spec.md` P16 for API shape) and must not deviate.
- File ownership matrix in `CLAUDE.md` applies:
  - `database` owns the P16 migration file (`supabase/migrations/20260703000002_p16_agents.sql`)
  - `backend` owns `lib/agents/`, all `app/api/agents/` and `app/api/webhook/` route handlers, and `lib/types.ts` P16 type additions
  - `frontend` owns agent pages, playground chat UI, WhatsApp QR modal, channel connection UI, sidebar menu update
  - No agent modifies files owned by another agent
- The existing P6 RAG pipeline (`lib/assistant/rag.ts` or equivalent) is NOT modified. P16 adds `lib/agents/rag.ts` which may share embedding/chunking utilities but has its own scoping logic.
- `AGENT_CHANNEL_ENCRYPTION_KEY` must never appear in client-side code or env vars with `NEXT_PUBLIC_` prefix.
- Channel credentials (`bot_token`, `client_state`) must never be logged or returned in API responses.
- `scripts/verify.sh` (eslint + tsc --noEmit + vitest run) must pass before QA/Security review.

Open questions for the human: none for P16 -- all interfaces are fully specified.
