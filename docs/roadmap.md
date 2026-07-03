# InTrustVault — Roadmap

**Current phase: P4 (complete). P5 next.**

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

## P5 — Blockchain anchoring 🔮
Goal: cryptographic proof anchoring to a public blockchain for tamper-evident verification.

- Compute a Merkle root from a batch of document binary hashes on a periodic cadence.
- Anchor the Merkle root to a blockchain testnet (e.g., Ethereum Sepolia, Polygon Mumbai, or a
  lightweight L2 like Base/Optimism).
- Store the transaction hash and block number as proof references.
- Verification endpoint: given a document ID, return the proof path (Merkle proof + on-chain
  transaction) so anyone can independently verify the document existed with that hash at that time.
- Mock/local proof store for development (swappable backend: file → DB → blockchain).
- UI: proof badge on documents ("Anchored on-chain"), verification page with proof details.
- No gas cost in dev; minimal gas in production (Merkle root batches many documents into one transaction).

## P6 — AI Vault Assistant 🤖
Goal: conversational AI that answers questions about your vault documents using RAG (Retrieval-Augmented
Generation).

- Ingest pipeline: chunk and embed vault documents for semantic search.
- Chat interface: natural language queries about your documents (e.g., "What changed between v1 and v2
  of the contract?", "Find all documents mentioning 'payment terms'", "Summarize the Q1 report").
- RAG architecture: query → retrieve relevant chunks → prompt LLM with context → response.
- Source citations: every answer links back to the specific documents and chunks used.
- Streaming responses: real-time token-by-token output.
- Session history: persist chat history per tenant.
- Access control: only search documents the user has permission to view.
- Degraded mode: fallback to basic search if embedding/vector store is unavailable.

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
