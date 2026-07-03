# TrustVault -- Database Contract (P5)

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

---

## 11. P5 Additions: Blockchain Anchoring Columns

### 11a. Overview

P5 adds four columns to the `documents` table for blockchain anchoring metadata. All columns are nullable -- a document only has these values populated after a successful `POST /api/anchor` call. Documents from earlier phases (P1-P4) have NULL for all four columns.

### 11b. New Columns on `documents`

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `fingerprint` | `text` | NULL | `NULL` | keccak256 fingerprint as 0x-prefixed hex string (66 characters). Computed from `binary_hash` + `text_hash` via `keccak256(abi.encodePacked(...))`. Set once at anchor time; never changes. |
| `chain` | `text` | NULL | `NULL` | Human-readable chain identifier (e.g., `"anvil"`, `"sepolia"`, `"base"`, `"mainnet"`). Set from the environment at anchor time. |
| `tx_hash` | `text` | NULL | `NULL` | Transaction hash of the anchor transaction. 0x-prefixed hex string (66 characters). References the on-chain transaction that emitted the `Anchored` event. |
| `anchored_at` | `timestamptz` | NULL | `NULL` | Block timestamp when the anchor transaction was confirmed. Converted from unix seconds to `timestamptz` at insert time. |

### 11c. Constraints

- `UNIQUE (fingerprint)` -- No two documents can share the same fingerprint. This is a logical consequence of the fingerprint formula: each `(binary_hash, text_hash)` pair maps to a unique keccak256 output (collision resistance of keccak256). This constraint also prevents double-anchoring of the same document.

**Note:** The unique constraint is applied with `NULLS NOT DISTINCT` behavior (Postgres 15+ default). Since `fingerprint` is only non-null for anchored documents, multiple documents with `NULL` fingerprint are allowed.

### 11d. Indexes

| Index name | Columns | Purpose |
|---|---|---|
| `documents_fingerprint_unique` | `fingerprint` | Unique constraint index (auto-created by UNIQUE). Enforces one anchor per fingerprint. |
| `documents_chain_idx` | `chain` | Filter documents by anchoring chain. |
| `documents_anchored_at_idx` | `anchored_at DESC` | List documents by anchor time (newest first). |

### 11e. Updated Full `documents` Table Columns (P5)

| Column | Type | Nullable | Default | Phase Added |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | P1 |
| `name` | `text` | NOT NULL | -- | P1 |
| `storage_path` | `text` | NOT NULL | -- | P1 |
| `binary_hash` | `text` | NOT NULL | -- | P1 |
| `text_hash` | `text` | NOT NULL | -- | P1 |
| `extracted_text` | `text` | NOT NULL | `''` | P1 |
| `file_size_bytes` | `bigint` | NOT NULL | -- | P1 |
| `file_type` | `text` | NOT NULL | `'application/pdf'` | P3 |
| `tenant_id` | `uuid` | NOT NULL | -- | P2 |
| `project_id` | `uuid` | NOT NULL | -- | P2 |
| `uploaded_by` | `uuid` | NOT NULL | -- | P2 |
| `deleted_at` | `timestamptz` | NULL | `NULL` | P4 |
| `deleted_by` | `uuid` | NULL | `NULL` | P4 |
| `fingerprint` | `text` | NULL | `NULL` | **P5** |
| `chain` | `text` | NULL | `NULL` | **P5** |
| `tx_hash` | `text` | NULL | `NULL` | **P5** |
| `anchored_at` | `timestamptz` | NULL | `NULL` | **P5** |
| `created_at` | `timestamptz` | NOT NULL | `now()` | P1 |

### 11f. RLS Policies (Unchanged for P5)

P5 adds no new RLS policies. The existing `documents_select_member` and `documents_insert_editor` policies from P2 continue to govern access. The `UPDATE` operation used by `POST /api/anchor` to set the four anchoring columns requires an UPDATE policy. P2 did not define an UPDATE policy on documents (documents were considered immutable after upload). P5 must add:

```sql
-- Allow editors and admins to update anchoring fields on documents they have access to.
CREATE POLICY "documents_update_anchor" ON public.documents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = documents.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = documents.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
  );
```

**Important:** The route handler must restrict which columns can be updated. The UPDATE policy allows any column change, but the application code in `POST /api/anchor` must only SET `fingerprint`, `chain`, `tx_hash`, `anchored_at`. It must never modify `binary_hash`, `text_hash`, `extracted_text`, or any other column.

### 11g. Migration File

**File:** `supabase/migrations/20260622000000_p5_blockchain_anchor.sql`

```sql
-- ============================================================================
-- TrustVault P5: Blockchain Anchoring Columns
-- Migration: 20260622000000_p5_blockchain_anchor.sql
-- Prerequisite: 20260621000003_p4_soft_delete.sql (P4 soft delete columns)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. ADD ANCHORING COLUMNS TO documents
-- --------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS fingerprint text NULL DEFAULT NULL;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS chain text NULL DEFAULT NULL;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS tx_hash text NULL DEFAULT NULL;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS anchored_at timestamptz NULL DEFAULT NULL;

-- --------------------------------------------------------------------------
-- 2. UNIQUE CONSTRAINT ON fingerprint
--    Multiple NULL fingerprints are allowed; only non-NULL values must be unique.
-- --------------------------------------------------------------------------
-- Postgres 15+ treats NULLs as distinct by default for unique constraints,
-- so multiple rows with NULL fingerprint will coexist fine.
ALTER TABLE public.documents
  ADD CONSTRAINT documents_fingerprint_unique UNIQUE (fingerprint);

-- --------------------------------------------------------------------------
-- 3. INDEXES
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS documents_chain_idx ON public.documents (chain);

CREATE INDEX IF NOT EXISTS documents_anchored_at_idx ON public.documents (anchored_at DESC);

-- --------------------------------------------------------------------------
-- 4. UPDATE RLS POLICY (documents were previously INSERT+SELECT only)
-- --------------------------------------------------------------------------
-- P5 needs an UPDATE policy so that POST /api/anchor can set the anchoring
-- columns.  The same role check as INSERT applies: admin or editor.
CREATE POLICY "documents_update_anchor" ON public.documents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = documents.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = documents.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
  );
```

### 11h. Migration Strategy

- **Additive only:** The migration adds columns, indexes, a constraint, and a new RLS policy. No existing columns or data are modified.
- **Existing rows:** All existing documents will have `NULL` for the four new columns. They can be anchored later via `POST /api/anchor`.
- **New documents:** Documents uploaded after P5 will also have `NULL` for anchoring columns until explicitly anchored.
- **Rollback:** Drop the UPDATE policy, drop the indexes, drop the unique constraint, drop the four columns. Purely additive migration with a clean reverse path.
- **Migration file placement:** The migration file goes in `supabase/migrations/` alongside the four existing migrations. The timestamp `20260622000000` places it after all P1-P4 migrations.
- **Supabase GitHub auto-deploy:** New migration files pushed to the linked branch are automatically applied in timestamp order. No manual `supabase db push` needed.

### 11i. No Breaking Changes

- All existing columns, constraints, indexes, and RLS policies from P1-P4 are preserved.
- Existing queries (SELECT, INSERT) on `documents` continue to work without modification.
- The four new columns are all nullable with default NULL, so existing INSERT statements (which do not mention the new columns) continue to work.
- The `documents` type in `lib/types.ts` must add optional fields for the new columns, maintaining backward compatibility with existing code that destructures Document objects.

---
---

## 12. P6 Additions: AI Vault Assistant (pgvector + Chat)

### 12a. Overview

P6 adds an AI-powered conversational assistant that answers questions about vault documents using Retrieval-Augmented Generation (RAG). The system uses:

- **pgvector** for storing and querying document embeddings (semantic search).
- **OpenAI `text-embedding-3-small`** for generating embeddings (1536 dimensions).
- **DeepSeek `deepseek-chat`** for the chat LLM (consistent with P1-P5 AI provider).
- **Supabase** for storing chat sessions, messages, and document chunks.

The ingestion pipeline runs when documents are uploaded: text is chunked, embeddings are generated, and chunks are stored in `document_chunks`. At query time, the user's question is embedded, similar chunks are retrieved via cosine similarity, and the LLM answers with context + citations.

### 12b. New Extension

```sql
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
```

The `pgvector` extension must be enabled before creating any vector columns.

### 12c. New Table: `document_chunks`

#### Purpose

Stores text chunks extracted from uploaded documents, each with a vector embedding for semantic similarity search. Used by the RAG pipeline to retrieve relevant context for AI chat queries.

#### Columns

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `document_id` | `uuid` | NOT NULL | -- | FK to `documents.id`. The source document. ON DELETE CASCADE. |
| `project_id` | `uuid` | NOT NULL | -- | FK to `projects.id`. Denormalised for RLS efficiency. |
| `chunk_index` | `integer` | NOT NULL | -- | 0-based position within the document's chunk sequence. |
| `content` | `text` | NOT NULL | -- | The chunk's text content (500-1000 characters). |
| `embedding` | `vector(1536)` | NULL | NULL | OpenAI `text-embedding-3-small` embedding. Nullable for degraded-mode (embedding generation can fail gracefully). |
| `token_count` | `integer` | NOT NULL | `0` | Approximate token count of the chunk content. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp (UTC). |

#### Constraints

- `PRIMARY KEY (id)`
- `FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE` — deleting a document removes its chunks.
- `FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE`

#### Indexes

| Index name | Columns | Purpose |
|---|---|---|
| `document_chunks_pkey` | `id` | Primary key lookup |
| `document_chunks_document_id_idx` | `document_id` | Fetch all chunks for a document |
| `document_chunks_project_id_idx` | `project_id` | RLS + project-scoped queries |
| `document_chunks_embedding_idx` | `embedding` | **IVFFlat index** for cosine similarity search (`vector_cosine_ops`). Created after data exists. |

**Note:** The IVFFlat index on `embedding` uses `vector_cosine_ops` for cosine similarity search. It is created with `lists = 100` (suitable for up to ~1M chunks). The index is created AFTER the table exists (in the migration) so pgvector can build it.

### 12d. New Table: `chat_sessions`

#### Purpose

Stores chat conversation sessions. Each session belongs to a user within a project context. The session has a title and tracks when it was created and last updated.

#### Columns

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `project_id` | `uuid` | NOT NULL | -- | FK to `projects.id`. The project context for this chat. |
| `user_id` | `uuid` | NOT NULL | -- | FK to `auth.users.id`. The user who owns this session. |
| `title` | `text` | NOT NULL | `'New Chat'` | Display title for the session sidebar. Updated from first user message. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Session creation timestamp (UTC). |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | Last message timestamp (UTC). |

#### Constraints

- `PRIMARY KEY (id)`
- `FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE`
- `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`

#### Indexes

| Index name | Columns | Purpose |
|---|---|---|
| `chat_sessions_pkey` | `id` | Primary key lookup |
| `chat_sessions_project_user_idx` | `project_id`, `user_id` | List user's sessions in a project |
| `chat_sessions_updated_at_idx` | `updated_at DESC` | Order by most recently active |

### 12e. New Table: `chat_messages`

#### Purpose

Stores individual messages within a chat session. Each message has a role (user/assistant), content, and optional citations (for assistant messages that reference document chunks).

#### Columns

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `session_id` | `uuid` | NOT NULL | -- | FK to `chat_sessions.id`. ON DELETE CASCADE. |
| `role` | `text` | NOT NULL | -- | `'user'` or `'assistant'`. CHECK constraint enforces. |
| `content` | `text` | NOT NULL | -- | The message text content. |
| `citations` | `jsonb` | NULL | `NULL` | Array of citation objects (only for assistant messages). See citation shape below. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Message creation timestamp (UTC). |

#### Citation Shape (JSONB)

```ts
type Citation = {
  document_id: string;      // UUID of the source document
  document_name: string;    // Display name of the source document
  chunk_index: number;      // Index of the chunk within the document
  snippet: string;          // Short excerpt (first ~150 chars of chunk content)
};
```

The `citations` column stores `Citation[]` as JSONB, or `NULL` for user messages.

#### Constraints

- `PRIMARY KEY (id)`
- `FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE`
- `CHECK (role IN ('user', 'assistant'))`

#### Indexes

| Index name | Columns | Purpose |
|---|---|---|
| `chat_messages_pkey` | `id` | Primary key lookup |
| `chat_messages_session_id_idx` | `session_id`, `created_at` | Fetch messages in a session, ordered by time |

### 12f. RLS Policies (P6)

#### Table: `document_chunks`

```sql
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- SELECT: user can see chunks from documents in projects they are a member of
CREATE POLICY "document_chunks_select_member" ON public.document_chunks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = document_chunks.project_id AND user_id = auth.uid()
    )
  );

-- INSERT: user must be admin or editor of the project
CREATE POLICY "document_chunks_insert_editor" ON public.document_chunks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = document_chunks.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
  );

-- DELETE: admins and editors can delete chunks (e.g., re-ingestion)
CREATE POLICY "document_chunks_delete_editor" ON public.document_chunks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = document_chunks.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
  );
```

#### Table: `chat_sessions`

```sql
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- SELECT: user can see their own sessions in projects they belong to
CREATE POLICY "chat_sessions_select_own" ON public.chat_sessions
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: user can create sessions in projects they are a member of
CREATE POLICY "chat_sessions_insert_member" ON public.chat_sessions
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = chat_sessions.project_id AND user_id = auth.uid()
    )
  );

-- UPDATE: user can update their own sessions (title, updated_at)
CREATE POLICY "chat_sessions_update_own" ON public.chat_sessions
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: user can delete their own sessions
CREATE POLICY "chat_sessions_delete_own" ON public.chat_sessions
  FOR DELETE
  USING (user_id = auth.uid());
```

#### Table: `chat_messages`

```sql
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: user can see messages from their own sessions
CREATE POLICY "chat_messages_select_own" ON public.chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions
      WHERE id = chat_messages.session_id AND user_id = auth.uid()
    )
  );

-- INSERT: user can insert messages into their own sessions
CREATE POLICY "chat_messages_insert_own" ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_sessions
      WHERE id = chat_messages.session_id AND user_id = auth.uid()
    )
  );
```

### 12g. Migration File

**File:** `supabase/migrations/20260701000000_p6_ai_assistant.sql`

```sql
-- ============================================================================
-- TrustVault P6: AI Vault Assistant (pgvector + chat)
-- Migration: 20260701000000_p6_ai_assistant.sql
-- Prerequisite: 20260622000000_p5_blockchain_anchor.sql
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. ENABLE pgvector EXTENSION
-- --------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- --------------------------------------------------------------------------
-- 2. DOCUMENT CHUNKS TABLE (for RAG embeddings)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_chunks (
  id            uuid          NOT NULL DEFAULT gen_random_uuid(),
  document_id   uuid          NOT NULL,
  project_id    uuid          NOT NULL,
  chunk_index   integer       NOT NULL,
  content       text          NOT NULL,
  embedding     vector(1536)  NULL DEFAULT NULL,
  token_count   integer       NOT NULL DEFAULT 0,
  created_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT document_chunks_pkey PRIMARY KEY (id),
  CONSTRAINT document_chunks_document_id_fkey FOREIGN KEY (document_id)
    REFERENCES public.documents(id) ON DELETE CASCADE,
  CONSTRAINT document_chunks_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES public.projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx
  ON public.document_chunks (document_id);

CREATE INDEX IF NOT EXISTS document_chunks_project_id_idx
  ON public.document_chunks (project_id);

-- IVFFlat index for cosine similarity search on embeddings.
-- Lists = 100 is suitable for up to ~1 million chunks.
-- The index is created immediately; pgvector builds it as data is inserted.
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON public.document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- --------------------------------------------------------------------------
-- 3. CHAT SESSIONS TABLE
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id            uuid          NOT NULL DEFAULT gen_random_uuid(),
  project_id    uuid          NOT NULL,
  user_id       uuid          NOT NULL,
  title         text          NOT NULL DEFAULT 'New Chat',
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT chat_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT chat_sessions_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT chat_sessions_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS chat_sessions_project_user_idx
  ON public.chat_sessions (project_id, user_id);

CREATE INDEX IF NOT EXISTS chat_sessions_updated_at_idx
  ON public.chat_sessions (updated_at DESC);

-- --------------------------------------------------------------------------
-- 4. CHAT MESSAGES TABLE
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id            uuid          NOT NULL DEFAULT gen_random_uuid(),
  session_id    uuid          NOT NULL,
  role          text          NOT NULL CHECK (role IN ('user', 'assistant')),
  content       text          NOT NULL,
  citations     jsonb         NULL DEFAULT NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_session_id_fkey FOREIGN KEY (session_id)
    REFERENCES public.chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS chat_messages_session_id_idx
  ON public.chat_messages (session_id, created_at);

-- --------------------------------------------------------------------------
-- 5. RLS POLICIES
-- --------------------------------------------------------------------------

-- --- document_chunks ---
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_chunks_select_member" ON public.document_chunks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = document_chunks.project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "document_chunks_insert_editor" ON public.document_chunks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = document_chunks.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
  );

CREATE POLICY "document_chunks_delete_editor" ON public.document_chunks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = document_chunks.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
  );

-- --- chat_sessions ---
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_sessions_select_own" ON public.chat_sessions
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "chat_sessions_insert_member" ON public.chat_sessions
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = chat_sessions.project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "chat_sessions_update_own" ON public.chat_sessions
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat_sessions_delete_own" ON public.chat_sessions
  FOR DELETE
  USING (user_id = auth.uid());

-- --- chat_messages ---
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_select_own" ON public.chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions
      WHERE id = chat_messages.session_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "chat_messages_insert_own" ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_sessions
      WHERE id = chat_messages.session_id AND user_id = auth.uid()
    )
  );
```

### 12h. Migration Strategy

- **Additive only:** The migration adds new tables, indexes, and RLS policies. No existing tables or data are modified.
- **Existing rows:** No backfill needed. Existing documents will not have chunks until explicitly ingested.
- **New documents:** Documents uploaded after P6 should be automatically ingested (chunked + embedded) via the `POST /api/documents` and `POST /api/documents/bulk` route handlers calling the ingestion pipeline.
- **Rollback:** Drop RLS policies, drop tables (CASCADE), drop extension. Purely additive migration with a clean reverse path.
- **pgvector extension:** Uses `CREATE EXTENSION IF NOT EXISTS` — safe to run multiple times.

### 12i. No Breaking Changes

- All existing tables, columns, constraints, indexes, and RLS policies from P1-P5 are preserved.
- Existing queries and API endpoints continue to work without modification.
- The new tables are only accessed by the new P6 API endpoints and library code.
- The `Document` type in `lib/types.ts` is unchanged — chunk data is separate.

---

## 13. P14 Additions: Tenant-Level RBAC + Invitations

### 13a. Overview

P12 removed the projects layer and project-level RBAC (`project_members` table). P14 introduces **tenant-level RBAC** via a `role` column on `profiles` and an **invitation system** for adding members to a tenant. Every user who belongs to a tenant has exactly one role within that tenant: `owner`, `admin`, `editor`, or `viewer`.

P14 also fixes broken RLS policies on `document_labels` and `shared_links` that still referenced the now-dropped `project_members` table, and tightens document/chunk write policies to enforce the new tenant-level role checks.

### 13b. Updated Table: `profiles`

Add a `role` column to encode the user's tenant-level RBAC role.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `role` | `text` | NOT NULL | `'viewer'` | One of: `'owner'`, `'admin'`, `'editor'`, `'viewer'`. Determines what the user can do within their tenant. |

**Constraint:** `CHECK (role IN ('owner', 'admin', 'editor', 'viewer'))`.

**Backfill rule:** For existing profiles, the earliest-created profile in each tenant is set to `role = 'owner'`. All other profiles default to `'viewer'`.

**Updated full `profiles` table columns (P14):**

| Column | Type | Nullable | Default | Phase Added |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | -- | P2 |
| `tenant_id` | `uuid` | NOT NULL | -- | P2 |
| `display_name` | `text` | NULL | `NULL` | P2 |
| `role` | `text` | NOT NULL | `'viewer'` | **P14** |
| `created_at` | `timestamptz` | NOT NULL | `now()` | P2 |

### 13c. New Table: `invitations`

#### Purpose

Stores pending (and accepted) tenant membership invitations. An admin or owner invites someone by email. The invitee receives a link with a cryptographically random token. When they accept, their `profiles` row is updated with the tenant's ID and the granted role.

#### Columns

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` | Primary key |
| `tenant_id` | `uuid` | NOT NULL | -- | FK to `tenants.id`. The tenant the invitee will join. ON DELETE CASCADE. |
| `email` | `text` | NOT NULL | -- | Email address of the invitee (case-insensitive match at accept time via `LOWER()`). |
| `role` | `text` | NOT NULL | -- | The role the invitee will receive. Cannot be `'owner'`. CHECK constraint enforces. |
| `token` | `text` | NOT NULL | -- | 64-character hex string. `UNIQUE`. Generated server-side via `crypto.randomBytes(32).toString('hex')`. |
| `created_by` | `uuid` | NOT NULL | -- | FK to `auth.users.id`. The admin/owner who sent the invitation. |
| `created_at` | `timestamptz` | NOT NULL | `now()` | Row creation timestamp (UTC). |
| `expires_at` | `timestamptz` | NOT NULL | -- | 7 days after `created_at`. Invitation is invalid after this time. |
| `accepted_at` | `timestamptz` | NULL | `NULL` | Set when the invitee accepts. NULL means pending. |

#### Constraints

- `PRIMARY KEY (id)`
- `UNIQUE (token)` -- token must be globally unique.
- `FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE`
- `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE`
- `CHECK (role IN ('admin', 'editor', 'viewer'))` -- owner cannot be granted via invitation.
- Application-layer rule: if a pending invitation already exists for the same `(tenant_id, email)` pair, the old one is revoked (deleted) before the new one is created. This ensures at most one pending invitation per email per tenant.

#### Indexes

| Index name | Columns | Purpose |
|---|---|---|
| `invitations_pkey` | `id` | Primary key lookup |
| `invitations_token_unique` | `token` | Unique constraint index (auto-created). Fast token lookup on accept. |
| `invitations_tenant_id_idx` | `tenant_id` | List pending invitations for a tenant. |
| `invitations_tenant_email_idx` | `tenant_id`, `email` | Check for existing invitation for the same email in a tenant. |

### 13d. RLS Policies for `invitations`

```sql
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- SELECT: members of the tenant can see pending invitations
CREATE POLICY "invitations_select_tenant_member" ON public.invitations
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

-- INSERT: admin or owner can create invitations
CREATE POLICY "invitations_insert_admin" ON public.invitations
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin')
  );

-- DELETE: admin or owner can revoke invitations
CREATE POLICY "invitations_delete_admin" ON public.invitations
  FOR DELETE
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin')
  );
```

There is no UPDATE policy on `invitations`. The only mutation to an existing invitation row is setting `accepted_at`, which happens in a route handler using a service-role client (the accepting user does not yet have a tenant_id to satisfy RLS).

### 13e. Fixed RLS Policies (Broken by P12)

P12 dropped `project_members` and `projects` tables, but several RLS policies on `document_labels` and `shared_links` still reference `project_members`. The P14 migration drops and recreates them using tenant-level checks.

#### document_labels (fix)

The old policies joined through `project_members` (which no longer exists). The new policies check that the user belongs to the same tenant as the document.

```sql
-- Drop broken policies
DROP POLICY IF EXISTS "document_labels_select_member" ON public.document_labels;
DROP POLICY IF EXISTS "document_labels_insert_editor" ON public.document_labels;
DROP POLICY IF EXISTS "document_labels_delete_editor" ON public.document_labels;

-- SELECT: user can see labels attached to documents in their tenant
CREATE POLICY "document_labels_select_tenant" ON public.document_labels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_labels.document_id
        AND d.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- INSERT: user must be owner, admin, or editor in the tenant
CREATE POLICY "document_labels_insert_editor" ON public.document_labels
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_labels.document_id
        AND d.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );

-- DELETE: user must be owner, admin, or editor in the tenant
CREATE POLICY "document_labels_delete_editor" ON public.document_labels
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_labels.document_id
        AND d.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );
```

#### shared_links (fix)

The old policies on `shared_links` referenced `project_members`. P12 dropped the `project_id` column from `shared_links`. The fixed policies are scoped to the link creator and tenant admins.

```sql
-- Drop broken policies
DROP POLICY IF EXISTS "shared_links_select_member" ON public.shared_links;
DROP POLICY IF EXISTS "shared_links_insert_editor" ON public.shared_links;
DROP POLICY IF EXISTS "shared_links_update_editor" ON public.shared_links;
DROP POLICY IF EXISTS "shared_links_delete_editor" ON public.shared_links;

-- SELECT: user can see their own shared links
-- PLUS admins/owners can see all shared links in their tenant
-- (tenant is derived from created_by -> profiles.tenant_id)
CREATE POLICY "shared_links_select_own_or_admin" ON public.shared_links
  FOR SELECT
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles creator
      WHERE creator.id = shared_links.created_by
        AND creator.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin')
    )
  );

-- INSERT: any authenticated user in a tenant can create shared links
CREATE POLICY "shared_links_insert_auth" ON public.shared_links
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid())
  );

-- UPDATE: owner, admin, or the creator
CREATE POLICY "shared_links_update_own_or_admin" ON public.shared_links
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin')
  );

-- DELETE: owner, admin, or the creator
CREATE POLICY "shared_links_delete_own_or_admin" ON public.shared_links
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin')
  );
```

### 13f. Tightened RLS Policies with Role Checks

P11 created permissive tenant-scoped INSERT and UPDATE policies on `documents` and `document_chunks` (any authenticated user in the tenant could write). P14 tightens these to require at least `editor` role for write operations.

#### documents (tighten)

```sql
-- Drop existing permissive policies
DROP POLICY IF EXISTS "documents_tenant_insert" ON public.documents;
DROP POLICY IF EXISTS "documents_tenant_update" ON public.documents;

-- INSERT: owner, admin, or editor only
CREATE POLICY "documents_tenant_insert" ON public.documents
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND uploaded_by = auth.uid()
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );

-- UPDATE: owner, admin, or editor only (soft-delete, anchoring)
CREATE POLICY "documents_tenant_update" ON public.documents
  FOR UPDATE
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );
```

The SELECT policy (`documents_tenant_access`) remains permissive -- viewers can still read documents.

#### document_chunks (tighten)

```sql
-- Drop existing permissive policies
DROP POLICY IF EXISTS "document_chunks_tenant_insert" ON public.document_chunks;
DROP POLICY IF EXISTS "document_chunks_tenant_delete" ON public.document_chunks;

-- INSERT: owner, admin, or editor only
CREATE POLICY "document_chunks_tenant_insert" ON public.document_chunks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_chunks.document_id
        AND d.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );

-- DELETE: owner, admin, or editor only
CREATE POLICY "document_chunks_tenant_delete" ON public.document_chunks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_chunks.document_id
        AND d.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );
```

The SELECT policy (`document_chunks_tenant_access`) remains permissive -- viewers can still read chunks (needed for RAG).

### 13g. Updated `handle_new_user` Trigger

The `on_auth_user_created` trigger (from P2) must be updated to set `role = 'owner'` for the new user who creates a tenant during sign-up. The updated trigger:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_tenant_id uuid;
BEGIN
  INSERT INTO public.tenants (name) VALUES (NEW.email) RETURNING id INTO new_tenant_id;
  INSERT INTO public.profiles (id, tenant_id, display_name, role)
  VALUES (NEW.id, new_tenant_id, NEW.email, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 13h. Complete P14 Migration SQL

**File:** `supabase/migrations/20260703000000_p14_rbac_invitations.sql`

```sql
-- ============================================================================
-- TrustVault P14: Tenant-Level RBAC + Invitations
-- Migration: 20260703000000_p14_rbac_invitations.sql
-- Prerequisite: 20260702000000_p13_fix_chat_sessions.sql
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. ADD role COLUMN TO profiles
-- --------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'viewer'
  CHECK (role IN ('owner', 'admin', 'editor', 'viewer'));

-- --------------------------------------------------------------------------
-- 2. BACKFILL: earliest profile per tenant becomes owner
-- --------------------------------------------------------------------------
WITH first_profiles AS (
  SELECT DISTINCT ON (tenant_id) id
  FROM public.profiles
  ORDER BY tenant_id, created_at ASC
)
UPDATE public.profiles p
SET role = 'owner'
FROM first_profiles fp
WHERE p.id = fp.id;

-- --------------------------------------------------------------------------
-- 3. UPDATE handle_new_user TRIGGER to set owner role
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_tenant_id uuid;
BEGIN
  INSERT INTO public.tenants (name) VALUES (NEW.email) RETURNING id INTO new_tenant_id;
  INSERT INTO public.profiles (id, tenant_id, display_name, role)
  VALUES (NEW.id, new_tenant_id, NEW.email, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------------------------------------
-- 4. CREATE invitations TABLE
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitations (
  id            uuid          NOT NULL DEFAULT gen_random_uuid(),
  tenant_id     uuid          NOT NULL,
  email         text          NOT NULL,
  role          text          NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  token         text          NOT NULL,
  created_by    uuid          NOT NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  expires_at    timestamptz   NOT NULL,
  accepted_at   timestamptz   NULL DEFAULT NULL,

  CONSTRAINT invitations_pkey PRIMARY KEY (id),
  CONSTRAINT invitations_token_unique UNIQUE (token),
  CONSTRAINT invitations_tenant_id_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT invitations_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS invitations_tenant_id_idx
  ON public.invitations (tenant_id);

CREATE INDEX IF NOT EXISTS invitations_tenant_email_idx
  ON public.invitations (tenant_id, email);

-- --------------------------------------------------------------------------
-- 5. RLS POLICIES FOR invitations
-- --------------------------------------------------------------------------
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations_select_tenant_member" ON public.invitations
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "invitations_insert_admin" ON public.invitations
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin')
  );

CREATE POLICY "invitations_delete_admin" ON public.invitations
  FOR DELETE
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin')
  );

-- --------------------------------------------------------------------------
-- 6. FIX BROKEN document_labels RLS (remove project_members dependency)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "document_labels_select_member" ON public.document_labels;
DROP POLICY IF EXISTS "document_labels_insert_editor" ON public.document_labels;
DROP POLICY IF EXISTS "document_labels_delete_editor" ON public.document_labels;

CREATE POLICY "document_labels_select_tenant" ON public.document_labels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_labels.document_id
        AND d.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "document_labels_insert_editor" ON public.document_labels
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_labels.document_id
        AND d.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );

CREATE POLICY "document_labels_delete_editor" ON public.document_labels
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_labels.document_id
        AND d.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );

-- --------------------------------------------------------------------------
-- 7. FIX BROKEN shared_links RLS (remove project_members dependency)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "shared_links_select_member" ON public.shared_links;
DROP POLICY IF EXISTS "shared_links_insert_editor" ON public.shared_links;
DROP POLICY IF EXISTS "shared_links_update_editor" ON public.shared_links;
DROP POLICY IF EXISTS "shared_links_delete_editor" ON public.shared_links;

CREATE POLICY "shared_links_select_own_or_admin" ON public.shared_links
  FOR SELECT
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles creator
      WHERE creator.id = shared_links.created_by
        AND creator.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
        AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin')
    )
  );

CREATE POLICY "shared_links_insert_auth" ON public.shared_links
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "shared_links_update_own_or_admin" ON public.shared_links
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin')
  );

CREATE POLICY "shared_links_delete_own_or_admin" ON public.shared_links
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin')
  );

-- --------------------------------------------------------------------------
-- 8. TIGHTEN documents INSERT/UPDATE POLICIES (require editor+)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "documents_tenant_insert" ON public.documents;
DROP POLICY IF EXISTS "documents_tenant_update" ON public.documents;

CREATE POLICY "documents_tenant_insert" ON public.documents
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND uploaded_by = auth.uid()
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );

CREATE POLICY "documents_tenant_update" ON public.documents
  FOR UPDATE
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );

-- --------------------------------------------------------------------------
-- 9. TIGHTEN document_chunks INSERT/DELETE POLICIES (require editor+)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "document_chunks_tenant_insert" ON public.document_chunks;
DROP POLICY IF EXISTS "document_chunks_tenant_delete" ON public.document_chunks;

CREATE POLICY "document_chunks_tenant_insert" ON public.document_chunks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_chunks.document_id
        AND d.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );

CREATE POLICY "document_chunks_tenant_delete" ON public.document_chunks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_chunks.document_id
        AND d.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );
```

### 13i. Migration Strategy

- **Additive with fixes:** Adds one column to `profiles`, creates one new table (`invitations`), updates the `handle_new_user` trigger, and replaces broken/permissive RLS policies. No existing columns or data are destroyed.
- **Existing rows:** All existing profiles get `role = 'viewer'` except the earliest profile per tenant, which gets `role = 'owner'`. Existing invitations table is initially empty.
- **New sign-ups:** The updated `handle_new_user` trigger sets `role = 'owner'` for the tenant creator.
- **New invitations:** When an invitee accepts, the route handler updates `profiles.role` and `profiles.tenant_id` for that user.
- **Rollback:** Drop the `invitations` table, drop the `role` column from `profiles`, restore previous RLS policies, restore the old `handle_new_user` trigger. All reversible.
- **Supabase GitHub auto-deploy:** The migration file goes in `supabase/migrations/` alongside the existing thirteen migrations. The timestamp `20260703000000` places it after all P1-P13 migrations.

### 13j. No Breaking Changes

- All existing columns (except the new `role` on `profiles`) are preserved.
- Existing queries on `profiles` continue to work -- the `role` column is added with a default, so `SELECT *` returns one extra column.
- The `on_auth_user_created` trigger remains; its behavior is enhanced to set `role`.
- Tightened RLS policies are backwards-compatible for existing users with `owner` or `viewer` roles -- no existing user loses access they previously had (the previous policies allowed ALL authenticated users in the tenant to write; after P14, viewers lose write access, which is the intended behavior of RBAC).
- The `Document` and `Profile` types in `lib/types.ts` must be updated with the `role` field.
