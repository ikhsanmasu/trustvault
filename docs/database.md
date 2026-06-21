# TrustVault — Database Contract (P1)

This document is a **contract**. The `database` and `backend` agents must implement exactly what is specified here. Any required deviation must be flagged back to the architect before implementing.

---

## 1. Overview

TrustVault P1 uses a single Supabase project with:

- **Postgres** — one table (`documents`) storing all document metadata, hashes, and extracted text.
- **Storage** — one private bucket (`pdf-uploads`) holding the raw PDF files.

No RLS policies are applied in P1. The service-role key is used for all server-side data access. RLS is designed in from the start by including `tenant_id` and `project_id` columns (both nullable in P1) so P2 adds policies without a schema rewrite.

---

## 2. Table: `documents`

### Purpose

Stores one row per uploaded PDF document. Each row contains:
- The document's display name.
- The path to the raw file in Supabase Storage.
- The binary hash (SHA-256 of raw file bytes) — detects any file-level change.
- The text hash (SHA-256 of extracted PDF text) — detects content-level changes.
- The extracted text itself — used as input to the AI compare without re-extracting.
- Forward-compat nullable columns for P2 multi-tenancy (`tenant_id`, `project_id`).

### Columns

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `name` | `text` | NOT NULL | — | User-supplied display name for the document |
| `storage_path` | `text` | NOT NULL | — | Full path within the `pdf-uploads` bucket, e.g. `uploads/2026/abc.pdf` |
| `binary_hash` | `text` | NOT NULL | — | SHA-256 hex of the raw PDF bytes |
| `text_hash` | `text` | NOT NULL | — | SHA-256 hex of the extracted text string |
| `extracted_text` | `text` | NOT NULL | `''` | Full text extracted from the PDF; empty string if blank/corrupt |
| `file_size_bytes` | `bigint` | NOT NULL | — | Size of the uploaded file in bytes |
| `tenant_id` | `uuid` | NULL | `NULL` | Reserved for P2 multi-tenancy; always NULL in P1 |
| `project_id` | `uuid` | NULL | `NULL` | Reserved for P2 project grouping; always NULL in P1 |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp (UTC) |

### Constraints

- `PRIMARY KEY (id)`
- `name` must not be empty — enforced at the application layer (API route handler validates before insert).
- `binary_hash` and `text_hash` are 64-character lowercase hex strings — enforced at the application layer.

### Indexes

| Index name | Columns | Type | Purpose |
|---|---|---|---|
| `documents_pkey` | `id` | B-tree (auto) | Primary key lookup |
| `documents_created_at_idx` | `created_at DESC` | B-tree | Default list ordering (newest first) |
| `documents_name_idx` | `name` | B-tree | Text search on name (`ILIKE`) |
| `documents_binary_hash_idx` | `binary_hash` | B-tree | Fast duplicate detection by binary hash |
| `documents_tenant_id_idx` | `tenant_id` | B-tree | P2 tenant scoping (pre-created for P2 query plans) |

---

## 3. SQL — Create Table Statement

Copy-paste into the Supabase SQL editor or place in `supabase/migrations/20260621000000_init.sql`.

```sql
-- Enable pgcrypto for gen_random_uuid() if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- documents table
CREATE TABLE IF NOT EXISTS public.documents (
  id               uuid          NOT NULL DEFAULT gen_random_uuid(),
  name             text          NOT NULL,
  storage_path     text          NOT NULL,
  binary_hash      text          NOT NULL,
  text_hash        text          NOT NULL,
  extracted_text   text          NOT NULL DEFAULT '',
  file_size_bytes  bigint        NOT NULL,
  tenant_id        uuid          NULL DEFAULT NULL,
  project_id       uuid          NULL DEFAULT NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT documents_pkey PRIMARY KEY (id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS documents_created_at_idx
  ON public.documents (created_at DESC);

CREATE INDEX IF NOT EXISTS documents_name_idx
  ON public.documents (name);

CREATE INDEX IF NOT EXISTS documents_binary_hash_idx
  ON public.documents (binary_hash);

CREATE INDEX IF NOT EXISTS documents_tenant_id_idx
  ON public.documents (tenant_id);
```

> **Note:** No RLS is enabled in P1. Do not add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` until P2.

---

## 4. Supabase Storage

### Bucket

| Property | Value |
|---|---|
| Bucket name | `pdf-uploads` |
| Public | `false` (private) |
| Allowed MIME types | `application/pdf` |
| Max file size | 20 MB (20971520 bytes) — enforced at the API layer before upload |

### Access Policy (P1)

The bucket is **private**. No public access. All reads and writes use the **service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) from server-side route handlers only. The anon key must never be used to access this bucket.

No Supabase Storage RLS policies are added in P1. P2 will add per-tenant policies.

### File Path Convention

Files are stored at:

```
uploads/{year}/{uuid}.pdf
```

For example: `uploads/2026/550e8400-e29b-41d4-a716-446655440000.pdf`

- `{year}` is the UTC year at upload time (keeps the bucket organised for future cleanup).
- `{uuid}` is a freshly generated UUID (not the `documents.id`), so two uploads of the same file get different storage paths.

The full path (e.g. `uploads/2026/550e8400...pdf`) is stored in `documents.storage_path`.

---

## 5. SQL — Create Storage Bucket

Run once in the Supabase SQL editor or as part of the migration:

```sql
-- Create the storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdf-uploads',
  'pdf-uploads',
  false,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;
```

---

## 6. P2 Forward-Compat Notes

When P2 begins:
1. Add a `tenants` table and a `projects` table.
2. Add `FOREIGN KEY (tenant_id) REFERENCES tenants(id)` and `FOREIGN KEY (project_id) REFERENCES projects(id)` to `documents`.
3. Set `tenant_id NOT NULL` (with a back-fill default for existing rows).
4. Enable RLS on `documents` and add a policy: `USING (tenant_id = auth.jwt() ->> 'tenant_id')`.

None of these steps require changing the column set of `documents` — they are purely additive.

---

## 7. No Seed Data Required

P1 has no required seed data. The `database` agent may optionally create a `supabase/seed.sql` with a few sample document rows for local dev/demo convenience, but it is not required for the contract to be fulfilled.
