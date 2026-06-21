# TrustVault -- Database Contract (P2)

This document is a **contract**. The `database` and `backend` agents must implement exactly what is specified here. Any required deviation must be flagged back to the architect before implementing.

---

## 1. Overview

TrustVault P2 extends the P1 schema with **multi-tenancy, authentication, project organisation, and RBAC**. All additions are additive -- the `documents` table from P1 is retained and updated with NOT NULL constraints plus foreign keys.

### P2 Additions

- **`tenants`** -- organisational units that own projects and documents.
- **`profiles`** -- links Supabase Auth users to a tenant.
- **`projects`** -- named workspaces within a tenant; documents are grouped under projects.
- **`project_members`** -- assigns users to projects with a role (admin / editor / viewer).
- **RLS policies** on all user-data tables to enforce tenant and project isolation.
- **Updated `documents`** -- `tenant_id` and `project_id` become NOT NULL with FK constraints.

### P1 Baseline (Preserved)

The `documents` table structure, storage bucket, and all P1 indexes are preserved. The P2 migration extends, not rewrites.

---

## 2. New Tables

### 2a. Table: `tenants`

#### Purpose

Represents an organisational tenant. Every user belongs to exactly one tenant (via `profiles.tenant_id`). Every project is scoped to one tenant.

#### Columns

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `name` | `text` | NOT NULL | -- | Display name of the tenant (e.g. company name) |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp (UTC) |

#### Constraints

- `PRIMARY KEY (id)`
- `name` must not be empty -- enforced at application layer.

#### Indexes

| Index name | Columns | Purpose |
|---|---|---|
| `tenants_pkey` | `id` | Primary key lookup |

---

### 2b. Table: `profiles`

#### Purpose

Extends the Supabase `auth.users` table with application-specific data. Each row links one auth user to one tenant. A trigger (or application logic on sign-up) creates a profile row automatically when a user is created.

#### Columns

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | -- | Primary key; must equal the user's `auth.users.id` |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `tenants.id`. The tenant this user belongs to. |
| `display_name` | `text` | NULL | `NULL` | Optional human-readable name for UI display |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp (UTC) |

#### Constraints

- `PRIMARY KEY (id)`
- `FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE` -- deleting an auth user deletes their profile.
- `FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)` -- must reference a valid tenant.

#### Indexes

| Index name | Columns | Purpose |
|---|---|---|
| `profiles_pkey` | `id` | Primary key lookup |
| `profiles_tenant_id_idx` | `tenant_id` | List all users in a tenant |

---

### 2c. Table: `projects`

#### Purpose

A named workspace within a tenant. Documents are grouped under projects. Users are assigned to projects via `project_members`.

#### Columns

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `tenants.id`. The tenant that owns this project. |
| `name` | `text` | NOT NULL | -- | Display name of the project |
| `description` | `text` | NOT NULL | `''` | Optional description of the project's purpose |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp (UTC) |

#### Constraints

- `PRIMARY KEY (id)`
- `FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)`
- `name` must not be empty -- enforced at application layer.

#### Indexes

| Index name | Columns | Purpose |
|---|---|---|
| `projects_pkey` | `id` | Primary key lookup |
| `projects_tenant_id_idx` | `tenant_id` | List all projects in a tenant |

---

### 2d. Table: `project_members`

#### Purpose

Assigns users to projects with a role. This is the RBAC table. A user who is not in this table for a given project has no access to that project's documents.

#### Columns

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NOT NULL | -- | FK to `projects.id`. The project. |
| `user_id` | `uuid` | NOT NULL | -- | FK to `auth.users.id`. The user. |
| `role` | `text` | NOT NULL | -- | One of: `'admin'`, `'editor'`, `'viewer'` |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp (UTC) |

#### Constraints

- `PRIMARY KEY (id)`
- `UNIQUE (project_id, user_id)` -- a user can only have one role per project.
- `FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE` -- deleting a project removes all membership rows.
- `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` -- deleting an auth user removes their memberships.
- `role` must be one of `'admin'`, `'editor'`, `'viewer'` -- enforced by CHECK constraint: `CHECK (role IN ('admin', 'editor', 'viewer'))`.

#### Indexes

| Index name | Columns | Purpose |
|---|---|---|
| `project_members_pkey` | `id` | Primary key lookup |
| `project_members_project_user_unique` | `project_id`, `user_id` | Unique constraint (auto-indexed) |
| `project_members_user_id_idx` | `user_id` | List all projects a user belongs to |

**Application-layer rule:** When a project is created, the creating user is automatically inserted as a `project_member` with role `admin`.

---

## 3. Updated Table: `documents`

### Changes from P1

| Change | Details |
|---|---|
| `tenant_id` becomes `NOT NULL` | Previously `NULL` in P1. Now required. |
| `project_id` becomes `NOT NULL` | Previously `NULL` in P1. Now required. |
| FK: `tenant_id -> tenants(id)` | Ensures referential integrity. |
| FK: `project_id -> projects(id)` | Ensures referential integrity. |
| New column: `uploaded_by` | `uuid NOT NULL` -- references `auth.users.id`. Records who uploaded the document. |

### Updated Columns (full table for P2)

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `name` | `text` | NOT NULL | -- | User-supplied display name for the document |
| `storage_path` | `text` | NOT NULL | -- | Full path within the `pdf-uploads` bucket |
| `binary_hash` | `text` | NOT NULL | -- | SHA-256 hex of the raw PDF bytes |
| `text_hash` | `text` | NOT NULL | -- | SHA-256 hex of the extracted text string |
| `extracted_text` | `text` | NOT NULL | `''` | Full text extracted from the PDF |
| `file_size_bytes` | `bigint` | NOT NULL | -- | Size of the uploaded file in bytes |
| `tenant_id` | `uuid` | **NOT NULL** | -- | FK to `tenants.id`. The tenant that owns this document. |
| `project_id` | `uuid` | **NOT NULL** | -- | FK to `projects.id`. The project this document belongs to. |
| `uploaded_by` | `uuid` | **NOT NULL** | -- | FK to `auth.users.id`. The user who uploaded this document. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp (UTC) |

### Constraints

- `PRIMARY KEY (id)`
- `FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)`
- `FOREIGN KEY (project_id) REFERENCES public.projects(id)`
- `FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)`
- `name` must not be empty -- enforced at application layer.

### Indexes

| Index name | Columns | Purpose |
|---|---|---|
| `documents_pkey` | `id` | Primary key lookup |
| `documents_created_at_idx` | `created_at DESC` | Default list ordering (newest first) |
| `documents_name_idx` | `name` | Text search on name (`ILIKE`) |
| `documents_binary_hash_idx` | `binary_hash` | Fast duplicate detection by binary hash |
| `documents_tenant_id_idx` | `tenant_id` | Tenant scoping (RLS + query plans) |
| `documents_project_id_idx` | `project_id` | Project filtering (NEW for P2) |

---

## 4. RLS Policies

RLS is **enabled** on all user-data tables. This is the core of tenant isolation.

### 4a. Policy Helper Functions

Two helper functions are created in the migration to simplify policy expressions. They are defined in the `public` schema.

```sql
-- Returns the tenant_id of the currently authenticated user.
-- Returns NULL if no session (anon).
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Returns the role of the current user in a given project.
-- Returns NULL if the user is not a member.
CREATE OR REPLACE FUNCTION public.get_project_role(project_id uuid)
RETURNS text AS $$
  SELECT role FROM public.project_members
  WHERE project_id = $1 AND user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### 4b. Table: `tenants`

```sql
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- SELECT: user can see their own tenant
CREATE POLICY "tenants_select_own" ON public.tenants
  FOR SELECT
  USING (id = public.get_user_tenant_id());

-- INSERT: authenticated users can create a tenant (during sign-up)
CREATE POLICY "tenants_insert_auth" ON public.tenants
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: no update policy (tenant name changes not in P2 scope)
-- DELETE: no delete policy (tenant deletion not in P2 scope)
```

### 4c. Table: `profiles`

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: user can see their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- INSERT: service_role only (handled by application on sign-up, not via user-scoped client)
-- No insert policy for user-scoped access

-- UPDATE: user can update their own display_name
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- DELETE: no delete policy (profiles deleted via CASCADE from auth.users)
```

### 4d. Table: `projects`

```sql
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- SELECT: user can see projects they are a member of
CREATE POLICY "projects_select_member" ON public.projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = projects.id AND user_id = auth.uid()
    )
  );

-- INSERT: authenticated user can create a project; they become admin via app logic
CREATE POLICY "projects_insert_auth" ON public.projects
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND tenant_id = public.get_user_tenant_id()
  );

-- UPDATE: only project admins
CREATE POLICY "projects_update_admin" ON public.projects
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = projects.id
        AND user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- DELETE: only project admins
CREATE POLICY "projects_delete_admin" ON public.projects
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = projects.id
        AND user_id = auth.uid()
        AND role = 'admin'
    )
  );
```

### 4e. Table: `project_members`

```sql
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- SELECT: user can see members of projects they belong to
CREATE POLICY "project_members_select_peer" ON public.project_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members pm2
      WHERE pm2.project_id = project_members.project_id
        AND pm2.user_id = auth.uid()
    )
  );

-- INSERT: only project admins can add members
CREATE POLICY "project_members_insert_admin" ON public.project_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = project_members.project_id
        AND user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- UPDATE: only project admins can change roles
CREATE POLICY "project_members_update_admin" ON public.project_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = project_members.project_id
        AND user_id = auth.uid()
        AND role = 'admin'
    )
  );

-- DELETE: only project admins can remove members (but cannot remove themselves -- enforced at app layer)
CREATE POLICY "project_members_delete_admin" ON public.project_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = project_members.project_id
        AND user_id = auth.uid()
        AND role = 'admin'
    )
  );
```

### 4f. Table: `documents`

```sql
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- SELECT: user can see documents in projects they are a member of
CREATE POLICY "documents_select_member" ON public.documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = documents.project_id AND user_id = auth.uid()
    )
  );

-- INSERT: user must be admin or editor of the project
CREATE POLICY "documents_insert_editor" ON public.documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = documents.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
    AND documents.uploaded_by = auth.uid()
    AND documents.tenant_id = public.get_user_tenant_id()
  );

-- UPDATE: no update policy (document updates not in P2 scope)
-- DELETE: no delete policy (document deletion not in P2 scope)
```

---

## 5. Supabase Storage

### 5a. Bucket (P1 Baseline -- Preserved)

| Property | Value |
|---|---|
| Bucket name | `pdf-uploads` |
| Public | `false` (private) |
| Allowed MIME types | `application/pdf` |
| Max file size | 20 MB (20971520 bytes) |

### 5b. Storage RLS Policies (NEW for P2)

Storage access must also be scoped to tenants. Documents uploaded by a user must only be readable by members of the same project.

```sql
-- Restrict uploads: user must be editor or admin of the target project
-- The storage path convention embeds project_id: uploads/{year}/{project_id}/{uuid}.pdf
-- (Updated from P1 to include project_id in the path for RLS enforcement)

-- Allow read access to storage objects if the user is a member of the
-- project that owns the document. The project_id is extracted from the path.
-- Simplified approach for P2: storage is accessed only via server-side route handlers
-- which already enforce access. No direct browser access to storage.
-- The RLS below ensures even direct API calls are scoped.
```

For P2, storage access remains **server-side only** via route handlers. The route handler checks project membership before serving any file. Direct storage URL access is not exposed to the browser. This is simpler and more secure than path-based storage RLS policies for the current scope.

### 5c. Updated File Path Convention (P2)

```
uploads/{year}/{project_id}/{uuid}.pdf
```

Example: `uploads/2026/550e8400-e29b-41d4-a716-446655440000/3f2504e0-4f89-11d3-9a0c-0305e82c3301.pdf`

- `{year}` -- UTC year at upload time.
- `{project_id}` -- the UUID of the project the document belongs to (allows easy bucket organisation and future RLS).
- `{uuid}` -- freshly generated UUID for uniqueness.

---

## 6. Migration Strategy

### 6a. Migration Files

P2 adds ONE migration file. It is additive -- it does not drop or alter P1 data beyond making existing nullable columns NOT NULL with a backfill.

```
supabase/
  migrations/
    20260621000000_init.sql          ← P1: create documents table + bucket (DO NOT EDIT)
    20260621000001_p2_auth_rbac.sql  ← P2: tenants, profiles, projects, project_members,
                                        update documents, add RLS policies, helper functions
  seed.sql                            ← optional demo data (updated for P2)
```

**Rule:** Never edit `20260621000000_init.sql`. The P2 migration builds on top of it.

### 6b. P2 Migration Steps (in order within the migration file)

1. Create `tenants` table.
2. Create `profiles` table (with FKs to `auth.users` and `tenants`).
3. Create `projects` table (with FK to `tenants`).
4. Create `project_members` table (with FKs to `projects` and `auth.users`).
5. **Backfill existing documents (if any):**
   - Insert a "Default Tenant" (id = `00000000-0000-0000-0000-000000000000`, name = 'Default Tenant') -- only if rows exist in `documents`.
   - Insert a "Default Project" under that tenant.
   - Update all existing `documents` rows: set `tenant_id` and `project_id` to the defaults, set `uploaded_by` to a sentinel value or the backfill user.
   - **Note:** In practice, production will have zero documents at P2 launch. This backfill is for dev environments that have P1 test data.
6. Add `uploaded_by` column to `documents` (nullable initially, filled during backfill).
7. Alter `documents` columns to NOT NULL: `tenant_id`, `project_id`, `uploaded_by`.
8. Add FK constraints on `documents`: `tenant_id -> tenants(id)`, `project_id -> projects(id)`, `uploaded_by -> auth.users(id)`.
9. Create the two RLS helper functions (`get_user_tenant_id`, `get_project_role`).
10. Enable RLS on all tables and create all policies listed in Section 4.
11. Add `documents_project_id_idx` index.

### 6c. Rollback

The P2 migration is designed to be reversible for development purposes. A down migration would:
1. Drop RLS policies.
2. Drop helper functions.
3. Remove NOT NULL constraints and FK constraints from `documents`.
4. Drop `uploaded_by` column from `documents`.
5. Drop `project_members`, `projects`, `profiles`, `tenants` tables (CASCADE).

Production rollback is not anticipated -- P2 is additive.

---

## 7. Complete P2 SQL Migration

This is the full migration file content for `supabase/migrations/20260621000001_p2_auth_rbac.sql`. Copy-paste into the file.

```sql
-- ============================================================================
-- TrustVault P2: Authentication, Multi-tenancy, Projects, RBAC, RLS
-- Migration: 20260621000001_p2_auth_rbac.sql
-- Prerequisite: 20260621000000_init.sql (P1 documents table + pdf-uploads bucket)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. TENANTS TABLE
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id          uuid          NOT NULL DEFAULT gen_random_uuid(),
  name        text          NOT NULL,
  created_at  timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT tenants_pkey PRIMARY KEY (id)
);

-- --------------------------------------------------------------------------
-- 2. PROFILES TABLE (extends auth.users)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid          NOT NULL,
  tenant_id     uuid          NOT NULL,
  display_name  text          NULL DEFAULT NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);

CREATE INDEX IF NOT EXISTS profiles_tenant_id_idx ON public.profiles (tenant_id);

-- --------------------------------------------------------------------------
-- 3. PROJECTS TABLE
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id          uuid          NOT NULL DEFAULT gen_random_uuid(),
  tenant_id   uuid          NOT NULL,
  name        text          NOT NULL,
  description text          NOT NULL DEFAULT '',
  created_at  timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);

CREATE INDEX IF NOT EXISTS projects_tenant_id_idx ON public.projects (tenant_id);

-- --------------------------------------------------------------------------
-- 4. PROJECT_MEMBERS TABLE (RBAC)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_members (
  id          uuid          NOT NULL DEFAULT gen_random_uuid(),
  project_id  uuid          NOT NULL,
  user_id     uuid          NOT NULL,
  role        text          NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at  timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT project_members_pkey PRIMARY KEY (id),
  CONSTRAINT project_members_project_user_unique UNIQUE (project_id, user_id),
  CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS project_members_user_id_idx ON public.project_members (user_id);

-- --------------------------------------------------------------------------
-- 5. BACKFILL EXISTING DOCUMENTS (if any P1 data exists in dev)
-- --------------------------------------------------------------------------
DO $$
DECLARE
  doc_count integer;
  default_tenant_id uuid := '00000000-0000-0000-0000-000000000000';
  default_project_id uuid;
  default_user_id uuid;
BEGIN
  SELECT count(*) INTO doc_count FROM public.documents;

  IF doc_count > 0 THEN
    -- Create a sentinel default tenant
    INSERT INTO public.tenants (id, name) VALUES (default_tenant_id, 'Default Tenant (P1 Backfill)')
    ON CONFLICT (id) DO NOTHING;

    -- Create a sentinel default project
    default_project_id := gen_random_uuid();
    INSERT INTO public.projects (id, tenant_id, name, description)
    VALUES (default_project_id, default_tenant_id, 'Default Project (P1 Backfill)', 'Auto-created for P1 data')
    ON CONFLICT (id) DO NOTHING;

    -- Use a sentinel UUID for uploaded_by (will be updated when real users claim documents)
    default_user_id := '00000000-0000-0000-0000-000000000001';

    -- Backfill documents
    UPDATE public.documents
    SET tenant_id = default_tenant_id,
        project_id = default_project_id
    WHERE tenant_id IS NULL OR project_id IS NULL;
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 6. ADD uploaded_by COLUMN TO DOCUMENTS
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE public.documents ADD COLUMN uploaded_by uuid;
    -- Fill with sentinel for backfilled rows
    UPDATE public.documents SET uploaded_by = '00000000-0000-0000-0000-000000000001'
    WHERE uploaded_by IS NULL;
    ALTER TABLE public.documents ALTER COLUMN uploaded_by SET NOT NULL;
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 7. MAKE tenant_id AND project_id NOT NULL ON DOCUMENTS
-- --------------------------------------------------------------------------
ALTER TABLE public.documents ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.documents ALTER COLUMN project_id SET NOT NULL;

-- --------------------------------------------------------------------------
-- 8. ADD FOREIGN KEY CONSTRAINTS ON DOCUMENTS
-- --------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD CONSTRAINT documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE public.documents
  ADD CONSTRAINT documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);

ALTER TABLE public.documents
  ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);

-- --------------------------------------------------------------------------
-- 9. ADD project_id INDEX ON DOCUMENTS
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS documents_project_id_idx ON public.documents (project_id);

-- --------------------------------------------------------------------------
-- 10. RLS HELPER FUNCTIONS
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_project_role(p_project_id uuid)
RETURNS text AS $$
  SELECT role FROM public.project_members
  WHERE project_id = p_project_id AND user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- --------------------------------------------------------------------------
-- 11. ENABLE RLS AND CREATE POLICIES
-- --------------------------------------------------------------------------

-- --- tenants ---
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_select_own" ON public.tenants
  FOR SELECT
  USING (id = public.get_user_tenant_id());

CREATE POLICY "tenants_insert_auth" ON public.tenants
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- --- profiles ---
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- --- projects ---
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select_member" ON public.projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = projects.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "projects_insert_auth" ON public.projects
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND tenant_id = public.get_user_tenant_id()
  );

CREATE POLICY "projects_update_admin" ON public.projects
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = projects.id AND user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "projects_delete_admin" ON public.projects
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = projects.id AND user_id = auth.uid() AND role = 'admin'
    )
  );

-- --- project_members ---
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_members_select_peer" ON public.project_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members pm2
      WHERE pm2.project_id = project_members.project_id AND pm2.user_id = auth.uid()
    )
  );

CREATE POLICY "project_members_insert_admin" ON public.project_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = project_members.project_id AND user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "project_members_update_admin" ON public.project_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = project_members.project_id AND user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "project_members_delete_admin" ON public.project_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = project_members.project_id AND user_id = auth.uid() AND role = 'admin'
    )
  );

-- --- documents ---
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select_member" ON public.documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = documents.project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "documents_insert_editor" ON public.documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = documents.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
    AND documents.uploaded_by = auth.uid()
    AND documents.tenant_id = public.get_user_tenant_id()
  );
```

---

## 8. Entity Relationship Summary (P2)

```
auth.users (Supabase built-in)
    |
    | 1:1 (via profiles.id = auth.users.id)
    v
profiles ──────> tenants
  |   tenant_id     |
  |                 | 1:N
  |                 v
  |              projects
  |                 |
  |                 | N:M (via project_members)
  |                 |
  |        ┌────────┴────────┐
  |        v                 v
  |  project_members    documents
  |    (user_id)          |
  |    (project_id)       | 1:N (via documents.project_id)
  |    (role)             |
  └───────────────────────┘
    (documents.uploaded_by -> auth.users.id)
    (documents.tenant_id -> tenants.id)
```

---

## 9. Seed Data (Optional)

The `database` agent may update `supabase/seed.sql` with P2 demo data. If provided, the seed should include:

1. A demo tenant.
2. A demo user profile (note: this requires an auth.users entry, which is hard to seed in SQL alone -- use `supabase/seed.sql` for table data only and document manual auth user creation for demo).
3. A demo project.
4. A project_members entry for the demo user with role `admin`.
5. A few sample documents scoped to the project.

Seed data is optional. The migration alone is sufficient.

---

## 10. No Breaking Changes to P1

- The `documents` table retains all P1 columns. New columns/constraints are additive or tightening (NULL -> NOT NULL with backfill).
- The `pdf-uploads` storage bucket is unchanged.
- The P1 migration file is never edited.
- P1 API route handlers that used the service-role client must be updated to use the user-scoped client, but the database schema itself does not break any P1 queries.
