# TrustVault — Architecture (P1)

## Open Decisions

None for P1. All interfaces are fully specified below.

---

## 1. System Overview

TrustVault is a single-tenant document-integrity platform. In P1 it is a **Next.js monolith** — the same application serves both the React UI and all API route handlers. Supabase provides Postgres (structured metadata) and Storage (raw PDF files). The DeepSeek API provides AI-based materiality assessment and is called only when the deterministic hash pipeline confirms that text has changed.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (React)                          │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────────┐  │
│  │ Upload Page  │  │  Document List  │  │  Compare View     │  │
│  └──────┬───────┘  └────────┬────────┘  └────────┬──────────┘  │
└─────────┼───────────────────┼────────────────────┼─────────────┘
          │ HTTP               │ HTTP                │ HTTP
          ▼                    ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│             Next.js App Router (Vercel)                         │
│                                                                 │
│  app/api/documents/route.ts     POST  /api/documents            │
│                                 GET   /api/documents            │
│  app/api/documents/[id]/route.ts  GET /api/documents/:id        │
│  app/api/compare/route.ts       POST  /api/compare              │
│                                                                 │
│  lib/core.ts  ──── pure functions: hash, extract, prompt        │
└──────────────────┬──────────────────────┬───────────────────────┘
                   │                      │
          ┌────────▼────────┐    ┌────────▼────────────┐
          │  Supabase        │    │  DeepSeek API        │
          │  Postgres        │    │  chat/completions    │
          │  (documents)     │    │  (JSON mode)         │
          │                  │    │  model: deepseek-    │
          │  Storage         │    │  chat                │
          │  (pdf-uploads)   │    └─────────────────────┘
          └─────────────────┘
```

---

## 2. Core Pipeline Invariant

This is an **architectural invariant** — no agent may break this ordering:

```
Step 1: Binary hash  (SHA-256 of raw file bytes)
        │
        ▼ binary hashes equal?
        YES → return "IDENTICAL" (files are byte-for-byte the same; skip steps 2 and 3)
        NO  ↓
Step 2: Text hash  (SHA-256 of extracted PDF text)
        │
        ▼ text hashes equal?
        YES → return "BINARY_DIFF_ONLY" (layout/encoding changed but text is the same)
        NO  ↓
Step 3: AI compare  (call DeepSeek only here)
        │
        ▼
        Return verdict: MATERIAL | NOT_MATERIAL + reasoning
```

**Rule:** The AI must never be called before steps 1 and 2 have run and confirmed text differs. This keeps costs deterministic and results reproducible.

---

## 3. Data Flow

### 3a. Upload Flow

```
Browser                  API: POST /api/documents      lib/core.ts        Supabase
  │                              │                          │                 │
  │── multipart/form-data ──────▶│                          │                 │
  │   (file: PDF, name: string)  │                          │                 │
  │                              │── computeBinaryHash() ──▶│                 │
  │                              │◀─ binaryHash ────────────│                 │
  │                              │── extractPdfText() ──────▶│                │
  │                              │◀─ text ──────────────────│                 │
  │                              │── computeTextHash() ─────▶│                │
  │                              │◀─ textHash ──────────────│                 │
  │                              │─── Storage.upload(file) ────────────────▶│
  │                              │◀── storagePath ───────────────────────────│
  │                              │─── INSERT documents row ────────────────▶│
  │                              │◀── document record ────────────────────── │
  │◀─ 201 { document } ─────────│                          │                 │
```

### 3b. Compare Flow

```
Browser                  API: POST /api/compare        lib/core.ts        DeepSeek
  │                              │                          │                 │
  │── { docAId, docBId } ───────▶│                          │                 │
  │                              │── SELECT doc A, doc B ──────────────────▶ Supabase
  │                              │◀─ docA, docB records ────────────────────│
  │                              │                          │                 │
  │                              │  Step 1: compare binaryHash               │
  │                              │  equal → return IDENTICAL                 │
  │                              │  not equal ↓                              │
  │                              │                          │                 │
  │                              │  Step 2: compare textHash                 │
  │                              │  equal → return BINARY_DIFF_ONLY          │
  │                              │  not equal ↓                              │
  │                              │                          │                 │
  │                              │── buildComparePrompt() ─▶│                │
  │                              │◀─ prompt ────────────────│                │
  │                              │─── POST chat/completions ────────────────▶│
  │                              │◀─── { verdict, reasoning } ───────────────│
  │                              │── parseAIResponse() ─────▶│               │
  │                              │◀─ CompareResult ──────────│               │
  │◀─ 200 { result } ───────────│                          │                 │
```

---

## 4. Module Responsibilities

### `lib/core.ts`
Pure functions only. No side effects. No I/O (no database calls, no HTTP calls).

| Function | Purpose |
|---|---|
| `computeBinaryHash(buffer: Buffer): string` | SHA-256 of raw file bytes; returns hex string |
| `extractPdfText(buffer: Buffer): Promise<string>` | Extract text from PDF via `unpdf`; returns empty string on corrupt/empty PDF, never throws |
| `computeTextHash(text: string): string` | SHA-256 of extracted text string; returns hex string |
| `buildComparePrompt(textA: string, textB: string): string` | Construct the system+user prompt for the DeepSeek materiality call |
| `parseAIResponse(raw: unknown): CompareVerdict` | Validate and parse the AI JSON response with a Zod schema; throws on invalid |

All functions in `lib/core.ts` have vitest unit tests in `lib/core.test.ts`.

### `app/api/documents/route.ts`
- `POST` — receives multipart form, calls `lib/core.ts`, writes to Supabase Storage + Postgres, returns document record.
- `GET` — lists documents from Postgres with optional text search on `name`.

### `app/api/documents/[id]/route.ts`
- `GET` — fetches single document record by UUID.

### `app/api/compare/route.ts`
- `POST` — receives two document IDs, fetches records, runs the three-step pipeline, optionally calls DeepSeek, returns comparison result.

### `app/**` (React UI)
- Renders the upload form, document list, document selection, and comparison result view.
- Calls the API routes. Contains no business logic (no hashing, no AI calls, no direct Supabase access).

### Supabase
- **Postgres:** single table `documents` (see `database.md`).
- **Storage:** bucket `pdf-uploads` holds the raw PDF files. Files are accessed from route handlers using the service-role key. The bucket is private for P1.

---

## 5. Technology Choices

| Choice | Rationale |
|---|---|
| Next.js App Router | Frontend + API in one repo; no separate backend service to deploy or maintain in P1 |
| TypeScript strict | Catches shape mismatches between API and UI early; required by convention |
| Supabase Postgres | Managed Postgres with a local CLI for dev; forward-compatible with RLS in P2 |
| Supabase Storage | Co-located with the database; service-role access enforces privacy for P1 |
| `unpdf` | Pure-JS PDF text extraction; works in the Node.js edge runtime; no native dependencies |
| `node:crypto` SHA-256 | Zero-dependency deterministic hashing |
| DeepSeek API | OpenAI-compatible `chat/completions`; JSON mode gives structured, parseable responses; cost-effective |
| Zod | Schema validation for AI responses and API inputs; integrated with TypeScript types |
| Tailwind + shadcn/ui | Rapid UI with accessible primitives; no design system to build from scratch |
| Vitest | Fast, ESM-native test runner; works in the same TypeScript config as the app |

---

## 6. Forward-Compat Notes for P2

P2 will add tenant → project → document hierarchy, Supabase Auth, and RLS.

- The `documents` table carries **nullable** `tenant_id UUID` and `project_id UUID` now. In P1 both are always `NULL`. In P2 they become `NOT NULL` (with a migration that back-fills existing rows) and RLS policies will filter on `tenant_id`.
- API routes are stateless and do not embed any single-user assumption. Adding auth middleware in P2 is additive.
- The Supabase client in route handlers uses `SUPABASE_SERVICE_ROLE_KEY` in P1 (no per-user auth). In P2 this will be replaced by user-scoped clients derived from the session token; the service-role key will be used only for admin operations.
- UI components should not hard-code "no project" assumptions; the compare flow should stay cleanly separable so a project-scoping wrapper can be added in P2.

---

## 7. Out of Scope for P1

- Authentication and user sessions (Supabase Auth — P2)
- Row Level Security policies (P2)
- Multi-tenancy and tenant isolation (P2)
- Project/workspace grouping (P2)
- Bulk upload (P2)
- Blockchain proof anchoring (P4)
- Scanned document OCR
- Semantic/summary-level hashing (beyond binary + text)

---

## 8. Handoff

Build sequence — must run in this order:

| Step | Agent | Picks up | Runs |
|---|---|---|---|
| 0 | `scaffold` | `docs/architecture.md` (Section 4 for module map) + `CLAUDE.md` (stack) | **Sequential, alone.** Creates the shared project skeleton before any build agent starts. |
| 1 | `database` | `docs/database.md` → create `supabase/migrations/` | **Parallel** with backend + frontend (after scaffold done) |
| 1 | `backend` | `docs/api-spec.md` + `docs/database.md` → implement `lib/core.ts` + route handlers | **Parallel** with database + frontend |
| 1 | `frontend` | `docs/api-spec.md` + `docs/architecture.md` → build UI | **Parallel** with database + backend |
| 2 | `qa` | `docs/roadmap.md` acceptance criteria → verify, write tests, build AI eval | **Sequential** after build (gate) |
| 2 | `security` | `docs/security.md` → audit, report | **Sequential** after build (gate, read-only) |
| 3 | `deployment` | `docs/deployment.md` → wire CI + Vercel | **Last**, after gates pass |

**Critical: `scaffold` is a serial prerequisite.** No build agent (database, backend, frontend)
may start before the project skeleton exists and compiles. This prevents conflicting
`package.json` / config files from parallel worktree agents.

**File ownership:** See `CLAUDE.md` for the full ownership matrix. Each agent owns a strict
subset of paths. No agent may touch another agent's owned files. If a cross-owner change is
needed (e.g., backend needs a new npm dependency), flag it to the conductor — do not edit
another agent's files.

Open questions for the human: none for P1 — all interfaces are fully specified.
