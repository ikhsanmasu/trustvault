# TrustVault — Agent Briefing (CLAUDE.md)

## What this is
Document-integrity tool: upload → layered hashing → store → compare → AI assesses the
MATERIALITY of changes (not forgery detection).
→ See `docs/vision.md` (why/what) and `docs/roadmap.md` (phases). **Current phase: P1.**

## Stack
- Framework: **Next.js (App Router) + React + TypeScript** — frontend + API route handlers in one app
- Styling: **Tailwind CSS + shadcn/ui**
- DB + Storage: **Supabase (Postgres + Storage)**; local via CLI for dev
- Auth (P2): **Supabase Auth + Row Level Security (RLS)**
- AI: **DeepSeek API** (direct call, OpenAI-compatible `chat/completions`, JSON mode) — model `deepseek-chat`
- CI: **GitHub Actions** · Deploy: **Vercel**

## Project layout
- Pure logic → `lib/core.ts` (hashing, PDF text extraction, prompt/schema)
- API route handlers → `app/api/**/route.ts`
- UI → `app/**` (React + shadcn/ui)
- Unit tests → `*.test.ts` (vitest)

## Core pipeline (architectural invariant — do not change without good reason)
Binary hash (raw file) → Text hash (extracted text) → AI compare (ONLY when text differs)

## Conventions (current phase)
- Pure functions (hashing, PDF extraction, prompt/schema) live in `lib/core.ts` and MUST have
  unit tests (vitest).
- Never call the AI before the deterministic hash check.
- Never commit secrets; `.env.local` stays local.
- Empty/corrupt PDFs → return empty text, never crash.
- TypeScript strict mode; `tsc --noEmit` and `eslint` must pass.

## Build model — agent team
This project is built by specialized agents (see `agents/`). The main session is the conductor.

**Pipeline & dependencies:**
1. `architect` runs **FIRST** → produces the contracts in `docs/` (architecture, database,
   api-spec, security, deployment).
2. `backend` & `frontend` build FROM `docs/api-spec.md` + `docs/database.md`. They may run in
   parallel **only once those contracts are locked**.
3. `qa` / `security` verify **AFTER** build — they are gates, not parallel peers.

**Orchestration rules:**
- Always run `architect` first; downstream agents must read the relevant `docs/` before implementing.
- Do NOT parallelize dependent work. Parallelize only genuinely independent tasks (e.g., backend
  vs frontend once the API contract is fixed).
- Treat `docs/api-spec.md` and `docs/database.md` as CONTRACTS: build agents must not silently
  change them — flag any needed change back to the architect.
- Deterministic guardrails wrap probabilistic agent work: `scripts/verify.sh` runs
  `eslint` + `tsc --noEmit` + `vitest run`. Deployment is via Vercel/GitHub Actions, not an LLM agent.

## Forward-compatible (so P2 is not a rewrite)
P2 adds multi-tenancy and **projects** (documents grouped by use case). The hierarchy will be
tenant → project → document. Avoid single-user / flat-list assumptions; nullable `tenant_id` and
`project_id` may be added early. Isolation will use Supabase RLS, so design tables with that in mind.

## Do NOT build yet (gate)
- Auth, multi-tenant, RBAC (P2) — unless told to move phases.
- Blockchain anchoring (P4).

## Maintenance
This file is living. When moving phases, condense old-phase detail and add the new phase. If a
recurring mistake appears, record the rule here — or in the relevant agent's file under `agents/`.