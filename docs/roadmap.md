# InTrustVault — Roadmap

**Current state: core roadmap (P1–P6) complete, plus P7–P22 platform hardening. See the log below.**

## P1 — Core integrity engine ✅
**Built: 2026-06-21.** Single-tenant proof of concept.

- Upload PDF documents and store them (file + metadata in Supabase).
- Layered hashing: binary hash (SHA-256 of raw bytes) + text hash (SHA-256 of extracted text).
- Compare two versions: deterministic hash check first → if text differs, DeepSeek AI assesses
  materiality (MATERIAL / NOT_MATERIAL).
- Minimal UI: searchable document list, upload form, compare page with AI verdict display.
- Magic-byte validation for PDF integrity.
- E2E pipeline: upload → compare → AI verdict.
- CI/CD: GitHub Actions workflow + Vercel deployment.
- **Tests:** 80 (unit + eval). **Migrations:** 1. **Files:** ~30.

## P2 — Multi-tenant, auth & RBAC ✅
**Built: 2026-06-21.** Full multi-tenant platform.

- Supabase Auth (email/password) + `@supabase/ssr` cookie-based sessions.
- `middleware.ts` refreshes sessions; `requireAuth()` gates all API routes.
- Row Level Security enabled on all tables (permissive policies — app layer enforces isolation).
- Roles: owner / admin / editor / viewer via `profiles.role` column.
- Label organisation: tag and filter documents using labels instead of project folders.
- Bulk upload: multi-file sequential processing, independent per-file error reporting.
- Tenant isolation: `tenant_id` scoping, RLS enforced.
- Storage bucket: private, service_role access for uploads.
- **Tests:** 174. **Files:** ~60. **Migrations:** 2.

## P3 — Multi-format support & dashboard UI ✅
**Built: 2026-06-22.** Any file type, modern dashboard.

- Accept 14 MIME types: PDF, DOCX, XLSX, JSON, CSV, TXT, HTML, MD, XML, RTF, DOC, ODT, plain text.
- Multi-format text extraction: `unpdf` (PDF), `mammoth` (DOCX), `xlsx` (XLSX), direct decode (text),
  structural extraction (RTF/ODT/DOC).
- Dashboard with sidebar layout: Dashboard (stats + recent documents), My Vault (searchable/filterable),
  Labels (document organisation), Settings (profile/password/tenant/members).
- Compare flow overhaul: modal-based compare with drag-and-drop ephemeral file upload.
  Uploaded file never persisted — in-memory only.
- Document preview modal: full-screen iframe renderer for PDF/images, extracted text for others.
- Upload modal: drag-and-drop, single or bulk, 14 formats.
- Collapsible sidebar, dark mode toggle, consistent icon system.
- Landing page: Hero, Features (6 cards), How It Works (3 steps), Use Cases (6 industries), CTA, Footer.
- **Tests:** 335. **Files:** ~85. **Migrations:** 3.

## P4 — Soft delete, audit trail & UX polish ✅
**Built: 2026-06-22.** Document lifecycle management.

- Soft delete: PATCH /api/documents/:id — removes file from storage, preserves hashes and metadata.
  Row appears grayed out with "Deleted" badge. Delete button disabled. Can restore (but file must be re-uploaded).
- Audit trail: `uploaded_by` and `deleted_by` columns track who uploaded and who deleted each document.
- File preview endpoint: GET /api/documents/:id/file — serves raw file with auth + tenant membership check.
  Returns 410 Gone for soft-deleted documents.
- Show/Hide deleted toggle in vault filter bar.
- UI polish: consistent deleted-document styling across vault grid and vault table.
  Line-through name, muted background, "Deleted" badge.
- Confirm dialog (modal) for delete/restore actions. Toast notifications for success.
- Sortable table headers in vault and dashboard pages (Name, Type, Size, Date).
- Icon-only action buttons (compare, view, delete) with tooltip hover.
- Authentication pages redesigned: split-screen layout with brand panel.
- Section headings enlarged, logo standardized across all pages (IconBrand component).
- Bulk upload expanded from PDF-only to all 14 MIME types.
- **Tests:** 408. **Files:** 94. **Migrations:** 4.

## P5 — Blockchain anchoring ✅
**Built: 2026-06-22.** Merkle-fingerprint anchoring with a Solidity contract (`contracts/TrustVaultAnchor.sol`, viem client in `lib/anchor.ts`). Documents get a `fingerprint` + on-chain proof reference; a verification endpoint checks integrity. Optional via `ANCHOR_*` env vars — the app degrades gracefully without them. Local dev uses Foundry's `anvil`.

## P6 — AI Vault Assistant ✅
**Built: 2026-07-01.** RAG assistant over vault documents: chunk + embed on upload (pgvector, OpenAI `text-embedding-3-small`), retrieval + DeepSeek chat with source citations, SSE streaming, per-tenant session history.

## P7–P22 — Platform log (condensed)

- **P7/P8** — analytics + public share links (with optional public chat over shared documents).
- **P9–P13** — document descriptions, label organisation, removal of the legacy project hierarchy, chat-session fixes.
- **P14** — tenant-level RBAC invitations (email via Resend, optional).
- **P15** — share options (expiry, chat toggle).
- **P16** — custom AI agents with WhatsApp/Telegram channels. **Removed in P22** — it sat outside the document-integrity vision and diluted the product; the AI surface is the vault assistant (P6) and shared-link chat.
- **P17** — usage tracking + plan quotas (free/pro/enterprise).
- **P18** — original filename preservation.
- **P19** — DB hardening: restrictive RLS everywhere, PII fix in the signup trigger, composite indexes.
- **P20** — dropped deprecated `chat_sessions.project_id`.
- **P21** — atomic quota consumption (`try_consume_tenant_usage`), DB-backed fixed-window rate limiting for public endpoints, storage bucket locked to the service role, magic-byte upload validation, middleware cleanup.
- **P22** — product refocus: agents feature dropped (tables + code), deployment consolidated on **Vercel + Supabase** (Railway/Docker configs removed), Vercel cron for monthly usage reset.

## Constraints
- Stack: **Next.js (App Router) + TypeScript**, **Supabase** (Postgres + Storage + Auth + pgvector
  for P6 embeddings), **DeepSeek API** (chat + compare), **Tailwind + shadcn/ui**, **Vercel** (hosting),
  **GitHub Actions** (CI).
- Deterministic guarantees (hashing, Merkle proofs, vitest tests, typecheck) wrap the probabilistic
  AI parts.
- RLS for P2+ (currently permissive — tighten when Supabase Cloud supports helper functions).
- Build is driven by a team of specialized agents; the architect produces the contracts the other
  agents build from.
- All migration files in `supabase/migrations/` — applied automatically by Supabase GitHub integration
  on merge to main.
