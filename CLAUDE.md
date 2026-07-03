# inTrustVault — Agent Briefing (CLAUDE.md)

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
2. `scaffold` runs **SECOND** (sequential, alone) → creates the shared project skeleton:
   `package.json`, tsconfig, next/tailwind/eslint/vitest configs, `app/layout.tsx`,
   `app/globals.css`. This MUST complete before any build agent is spawned.
3. `database`, `backend`, `frontend` run in **PARALLEL** → only after scaffold is committed.
   They ADD their own files on top of the skeleton — they NEVER re-scaffold.
4. `qa` / `security` verify **AFTER** build — they are gates, not parallel peers.
5. `deployment` runs **LAST** — CI config + scripts once everything is verified.

**Orchestration rules:**
- Always run `architect` first; downstream agents must read the relevant `docs/` before implementing.
- Scaffold is a serial gate: no build agent starts before the skeleton exists and compiles.
- Parallelize only genuinely independent tasks (backend vs frontend vs database — once the API
  contract and project skeleton are fixed).
- Treat `docs/api-spec.md` and `docs/database.md` as CONTRACTS: build agents must not silently
  change them — flag any needed change back to the architect.
- Deterministic guardrails wrap probabilistic agent work: `scripts/verify.sh` runs
  `eslint` + `tsc --noEmit` + `vitest run`. Deployment is via Vercel/GitHub Actions, not an LLM agent.

## File ownership matrix

Each agent OWNS a set of paths it may create/edit. **No agent may touch another agent's
owned paths.** This prevents parallel worktree conflicts.

| Agent | Creates / edits | Never touches |
|---|---|---|
| `architect` | `docs/*.md` | All code, config, supabase/ |
| `scaffold` | `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `components.json`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` | `lib/`, `app/api/`, `supabase/`, `components/`, `.github/`, `scripts/` |
| `database` | `supabase/migrations/`, `supabase/seed.sql` | `app/`, `lib/`, `components/`, config files |
| `backend` | `lib/core.ts`, `lib/core.test.ts`, `lib/supabase/`, `app/api/**/route.ts`, `lib/types.ts` | `supabase/`, `app/**/page.tsx`, `app/layout.tsx`, `components/`, config files |
| `frontend` | `app/**/page.tsx`, `components/**`, `hooks/`, `lib/api-client.ts` | `lib/core.ts`, `app/api/`, `supabase/`, config files |
| `deployment` | `.github/workflows/ci.yml`, `scripts/verify.sh`, `scripts/deploy.sh` | All application code |
| `qa` | `*.test.ts` (additions/edits only — never deletes existing tests), `tests/eval/` | All non-test code |
| `security` | Nothing (read-only audit) | All files (read-only) |
| `monitoring` | `lib/monitoring/`, instrumentation in `app/layout.tsx` (append only) | All business logic |

**Critical rule:** If an agent discovers it needs a file owned by another agent (e.g., backend
needs a new dependency in `package.json`), it flags the need to the conductor — it does NOT
edit that file directly.

## Forward-compatible (so P2 is not a rewrite)
P2 adds multi-tenancy and document organisation via labels. The hierarchy is
tenant → document. Avoid single-user / flat-list assumptions; nullable `tenant_id`
may be added early. Isolation will use Supabase RLS, so design tables with that in mind.

## Do NOT build yet (gate)
- Auth, multi-tenant, RBAC (P2) — unless told to move phases.
- Blockchain anchoring (P4).

## Maintenance
This file is living. When moving phases, condense old-phase detail and add the new phase. If a
recurring mistake appears, record the rule here — or in the relevant agent's file under `agents/`.
