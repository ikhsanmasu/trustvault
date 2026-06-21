# TrustVault — Security Model (P1)

This document is a **contract** for the `security` audit agent and a reference for `backend` and `deployment`. It defines the accepted threat model for P1 and the controls in place.

---

## 1. P1 Threat Model

TrustVault P1 is a **single-tenant, unauthenticated** system. There is no login, no user identity, and no access control beyond "can reach the server". This is intentional for P1 but carries explicit risk that must be documented and mitigated where practical.

### What P1 is

- A local or privately deployed tool for a single operator.
- Exposed only to trusted users (the developer or a small demo audience).
- Not designed for public internet exposure without additional controls (e.g. a reverse proxy with IP allowlist).

### What P1 is not

- A multi-user SaaS with user-level isolation.
- A system with any authentication or authorisation.
- A system designed to be safe with arbitrary public traffic.

### Risk acceptance for P1

| Risk | Accepted? | Mitigation |
|---|---|---|
| Any user can upload documents | Yes (by design) | File type + size validation; no executable content stored |
| Any user can view all documents | Yes (by design) | No PII in the demo dataset; P2 will add auth |
| Any user can trigger AI compare (cost) | Yes (limited) | Rate limiting is NOT in P1 scope; deploy behind network controls |
| Stored PDFs are accessible to anyone with the service-role key | N/A | Service-role key is server-side only; bucket is private |
| DeepSeek API key exposure | No | Key lives only in server env vars; never in client code |

---

## 2. Secret Management

### Required environment variables

| Variable | Sensitivity | Location |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Low (public) | `.env.local` for dev; Vercel env var for prod |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Low (public) | `.env.local` for dev; Vercel env var for prod |
| `SUPABASE_SERVICE_ROLE_KEY` | **HIGH — never expose to browser** | `.env.local` for dev; Vercel env var (server-only) for prod |
| `DEEPSEEK_API_KEY` | **HIGH — never expose to browser** | `.env.local` for dev; Vercel env var (server-only) for prod |

### Rules

1. `.env.local` is listed in `.gitignore` and must never be committed.
2. `SUPABASE_SERVICE_ROLE_KEY` and `DEEPSEEK_API_KEY` must only be accessed in server-side code (Next.js route handlers). They must never appear in any file under `app/` that is rendered client-side, and must never be referenced with the `NEXT_PUBLIC_` prefix.
3. No secret values may appear anywhere in the repository — not in code, not in comments, not in test fixtures.
4. GitHub Actions CI must not log secret values. Secrets are passed via GitHub Actions Secrets and referenced as `${{ secrets.NAME }}`.

### Verification checklist (for `security` agent)

- [ ] `git grep -r "SUPABASE_SERVICE_ROLE_KEY"` finds references only in server files (route handlers, migration scripts).
- [ ] `git grep -r "DEEPSEEK_API_KEY"` finds references only in server files.
- [ ] No `NEXT_PUBLIC_` prefix on either high-sensitivity variable.
- [ ] `.env.local` is not tracked by git (`git ls-files .env.local` returns nothing).

---

## 3. API Security for P1

### No authentication

P1 has no auth. All four API endpoints are open. This is accepted for P1 (see Section 1). The following compensating controls apply:

- Deploy behind a trusted network or local access only.
- No destructive endpoints (no DELETE, no overwrite of existing documents).
- Document data has no PII in the demo dataset.

### What is protected

- **Service-role key:** never sent to the browser; used only in route handlers.
- **DeepSeek API key:** never sent to the browser.
- **Supabase Storage bucket:** private; no public read access; accessible only via service-role.
- **Uploaded files:** stored in a private bucket; not returned as raw bytes by any API endpoint (only metadata and extracted text).

### What will change in P2

- All endpoints will require a valid Supabase Auth session token.
- RLS will enforce tenant isolation at the database layer so a misconfigured route handler cannot leak cross-tenant data.
- The service-role key will be used only for admin-level operations; per-user operations will use user-scoped Supabase clients derived from the session JWT.

---

## 4. Input Validation

Every API endpoint must validate all inputs before processing. The backend agent must implement these checks before any business logic or database access.

### POST /api/documents

| Input | Validation | Error |
|---|---|---|
| `file` field | Must be present in multipart form | 400 `MISSING_FILE` |
| `file` MIME type | Must be exactly `application/pdf` | 415 `INVALID_FILE_TYPE` |
| `file` size | Must be ≤ 20,971,520 bytes (20 MB) | 413 `FILE_TOO_LARGE` |
| `name` field | Must be present, non-empty string | 400 `MISSING_NAME` |
| `name` length | Must be ≤ 255 characters | 400 `NAME_TOO_LONG` |

**File type check:** Validate both the `Content-Type` header of the form field AND perform a magic-byte check on the first 4 bytes of the file (`%PDF` = `25 50 44 46`). A file renamed to `.pdf` with a non-PDF content type must be rejected.

### GET /api/documents

| Input | Validation | Error |
|---|---|---|
| `limit` | If provided: must be a positive integer ≤ 200 | 400 `INVALID_LIMIT` |
| `offset` | If provided: must be a non-negative integer | 400 `INVALID_OFFSET` |
| `search` | Sanitised before use in ILIKE (use parameterised query — no string concatenation) | — |

### GET /api/documents/[id]

| Input | Validation | Error |
|---|---|---|
| `id` | Must match UUID format: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` | 400 `INVALID_ID` |

### POST /api/compare

| Input | Validation | Error |
|---|---|---|
| `docAId` | Must be a valid UUID | 400 `INVALID_DOC_A_ID` |
| `docBId` | Must be a valid UUID | 400 `INVALID_DOC_B_ID` |
| `docAId !== docBId` | Must not be the same value | 400 `SAME_DOCUMENT` |

---

## 5. SQL Injection Prevention

All database queries must use the Supabase JS client's parameterised methods (`.select()`, `.insert()`, `.eq()`, etc.). **No raw SQL string concatenation with user input is permitted.** The Supabase client handles parameterisation automatically when using its query builder.

The one case where text is used in a query is the `search` parameter in `ILIKE`. This must be passed as a bound parameter:

```ts
// CORRECT — parameterised
.ilike('name', `%${search}%`)

// WRONG — never do this
.filter('name', 'ilike', `%${search}%`)  // only wrong if search is unsanitised string concat
```

The Supabase client's `.ilike()` method binds the value safely. Do not construct raw SQL strings.

---

## 6. AI Prompt Injection Risks

The compare endpoint embeds user-controlled content (extracted PDF text) into the DeepSeek prompt. An adversary could craft a PDF whose text attempts to override the system prompt or extract confidential information.

### Mitigations in P1

1. **System prompt is prepended and fixed.** The system prompt is a hardcoded string in `lib/core.ts`. User content is placed only in the user message, not the system message.
2. **Schema validation on AI output.** The response is validated with a Zod schema. Any response that does not conform (including injected instructions masquerading as verdicts) is rejected with `AI_PARSE_ERROR`.
3. **Text truncation.** Input text is truncated to 40,000 characters maximum. This limits the attack surface for long injected payloads.
4. **No confidential data in the prompt.** The prompt contains only the two document texts and a fixed instruction. There are no API keys, session tokens, or sensitive config values in the prompt.
5. **Output is treated as data, not instructions.** The `reasoning` field is displayed as text in the UI. It is never executed or interpreted as code.

### Residual risk

A sophisticated prompt injection could cause the AI to return a wrong `verdict` (e.g. claim NOT_MATERIAL when the change is MATERIAL). This is a correctness risk, not a confidentiality or integrity risk — the system's deterministic hash check is unaffected. Users must treat AI verdicts as advisory for high-stakes decisions.

---

## 7. Empty and Corrupt PDF Handling

`extractPdfText()` in `lib/core.ts` must never throw. If the PDF is corrupt, empty, encrypted, or otherwise unreadable, the function returns an empty string `""`. The upstream route handler:

- Stores `extracted_text = ""` in the database.
- Computes `text_hash = SHA-256("")` (a fixed known hash).
- Returns 201 normally — the document is stored, but its text could not be extracted.

On compare: if both documents have the same `text_hash` (e.g. both empty), the pipeline returns `TEXT_MATCH` / `BINARY_DIFF_ONLY` (or `BINARY_MATCH` if also identical binaries). The AI is never called when extracted text is empty for both documents (because their text hashes will be equal).

**Special case:** If doc A has empty text and doc B has non-empty text (or vice versa), the text hashes differ and the AI WILL be called. The AI will see one empty text and one populated text. This is correct behaviour — the change is likely material.

---

## 8. Never-Do List

These must never happen in any phase, including P1:

1. **Never commit `.env.local`** or any file containing secret values.
2. **Never use `NEXT_PUBLIC_` prefix on `SUPABASE_SERVICE_ROLE_KEY` or `DEEPSEEK_API_KEY`.**
3. **Never call the DeepSeek API before the binary and text hash checks** (would violate the core pipeline invariant and incur unnecessary cost).
4. **Never build SQL queries by string concatenation with user input** (SQL injection).
5. **Never serve raw PDF file bytes from Supabase Storage directly to the browser** in an unauthenticated endpoint (would expose all uploaded documents publicly).
6. **Never store secret values in Vercel environment variables as "plain" (non-secret)** — use Vercel's "Sensitive" flag for `SUPABASE_SERVICE_ROLE_KEY` and `DEEPSEEK_API_KEY`.
7. **Never log full request bodies** in production — they may contain file contents or extracted text.
8. **Never execute or `eval` any content from extracted PDF text or AI responses.**

---

## 9. What Changes in P2

P2 is the hardening phase for multi-tenancy. The following changes will be made:

| Control | P1 State | P2 Target |
|---|---|---|
| Authentication | None | Supabase Auth (email/password or OAuth) |
| Authorisation | None | RLS on all tables; roles: admin/editor/viewer |
| Tenant isolation | Single tenant; no isolation needed | `tenant_id` RLS policy on `documents` |
| Service-role key usage | All server operations | Admin ops only; user ops use user-scoped JWT |
| API endpoint access | Open | Require valid session token on all endpoints |
| Storage access | Service-role only | Per-tenant Storage path prefix + RLS |

P1 code should not make assumptions that prevent these additions. In particular:
- Do not hard-code `tenant_id = NULL` in queries (use `null` as a value that will later be a real UUID).
- Do not cache or memoize user identity (there is none in P1; P2 will add it per-request).
