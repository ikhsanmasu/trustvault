# TrustVault — Roadmap

**Current phase: P1**

The architect designs the CURRENT phase in full detail. Future phases are noted so that current
decisions stay forward-compatible, but they are NOT designed in detail until their phase begins.

## P1 — Core integrity engine (CURRENT) · single-tenant
Goal: a working end-to-end product that proves the core idea.

- Upload a PDF document and store it (file + metadata).
- Layered hashing: binary hash (raw file) + text hash (extracted text).
- Store document metadata, hashes, and extracted text.
- Compare two versions: deterministic hash check first; if text differs, AI assesses materiality.
- Minimal UI: a searchable document list where you pick documents and trigger compare via a button.
- **Done when:** upload → compare → AI returns a MATERIAL / NOT MATERIAL verdict, end to end.

## P2 — Multi-tenant, auth & RBAC
- Authentication and tenant isolation via Supabase Auth + Row Level Security (RLS).
- Roles: admin / editor / viewer.
- Every document scoped to a tenant; no cross-tenant access (enforced by RLS).
- **Projects/workspaces:** organize documents into projects by use case; a page to create and
  list projects, each containing its own documents.
- **Bulk upload:** upload multiple documents at once.
- **Document list:** searchable list with a per-document compare action.
- **Forward-compatible note for P1:** avoid single-user / flat-list assumptions. The hierarchy
  will be tenant → project → document, so nullable `tenant_id` and `project_id` may be introduced
  early so P2 is additive, not a rewrite.

## P3 — Documentation & demo
- README documenting the system and the AI-assisted build process.
- A narrative demo: a document whose value is altered → change detected → judged material.

## P4 — Tamper-resistant proof anchoring (bonus)
- Anchor document proofs to a blockchain testnet.
- A mocked/local proof store is acceptable until this phase; design the store to be swappable.

## Constraints
- Time-boxed build (~24h). Prefer a small, working core over broad, half-finished features.
- Stack: **Next.js (App Router) + TypeScript** (frontend + API routes), **Supabase** (Postgres +
  Storage, local via CLI) for data, **Supabase Auth + RLS** for P2, a **direct DeepSeek API** call
  (OpenAI-compatible, JSON mode; model deepseek-chat) for AI, **Tailwind + shadcn/ui** for UI. CI via **GitHub Actions**, deploy to **Vercel**.
- Deterministic guarantees (hashing, vitest tests, typecheck, hooks) wrap the probabilistic AI parts.
- Build is driven by a team of specialized agents; the architect produces the contracts the
  other agents build from.