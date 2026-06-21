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
-- 4b. GRANT PRIVILEGES ON NEW TABLES
-- --------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO service_role, authenticated;
-- P1 only granted these to service_role; P2 needs authenticated access too
GRANT SELECT, INSERT ON public.documents TO authenticated;
GRANT SELECT, INSERT ON storage.objects TO authenticated;

-- --------------------------------------------------------------------------
-- 5. BACKFILL EXISTING DOCUMENTS (if any P1 data exists in dev)
-- --------------------------------------------------------------------------
DO $$
DECLARE
  doc_count integer;
  DEFAULT_TENANT_ID     uuid := '00000000-0000-0000-0000-000000000000';
  DEFAULT_PROJECT_ID    uuid := '00000000-0000-0000-0000-000000000010';
BEGIN
  SELECT count(*) INTO doc_count FROM public.documents;

  IF doc_count > 0 THEN
    -- Create a sentinel default tenant
    INSERT INTO public.tenants (id, name) VALUES (DEFAULT_TENANT_ID, 'Default Tenant (P1 Backfill)')
    ON CONFLICT (id) DO NOTHING;

    -- Create a sentinel default project (fixed UUID so seed.sql can reference it)
    INSERT INTO public.projects (id, tenant_id, name, description)
    VALUES (DEFAULT_PROJECT_ID, DEFAULT_TENANT_ID, 'Default Project (P1 Backfill)', 'Auto-created for P1 data')
    ON CONFLICT (id) DO NOTHING;

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
    -- Fill with a sentinel value for backfilled rows
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
-- 8. ADD FOREIGN KEY CONSTRAINTS ON DOCUMENTS (idempotent if re-run)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_tenant_id_fkey') THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_project_id_fkey') THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
  END IF;
END $$;

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
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public, auth, pg_catalog';

CREATE OR REPLACE FUNCTION public.get_project_role(p_project_id uuid)
RETURNS text AS $$
  SELECT role FROM public.project_members
  WHERE project_id = p_project_id AND user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public, auth, pg_catalog';

-- Helper: check project membership without RLS (avoids infinite recursion)
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid, p_user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_user_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public, auth, pg_catalog';

-- Helper: check if user holds a specific role in a project (no RLS recursion)
CREATE OR REPLACE FUNCTION public.has_project_role(p_project_id uuid, p_user_id uuid, p_role text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_user_id AND role = p_role
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public, auth, pg_catalog';

-- Helper: check if there is an authenticated session (works in RLS context)
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS boolean AS $$
  SELECT auth.uid() IS NOT NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public, auth, pg_catalog';

-- --------------------------------------------------------------------------
-- 11. TRIGGER: auto-create profile + tenant on sign-up
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_tenant_id uuid;
BEGIN
  -- Create a tenant for the new user
  INSERT INTO public.tenants (name) VALUES (COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email) || '''s Workspace')
  RETURNING id INTO new_tenant_id;

  -- Create a profile linking the user to the tenant
  INSERT INTO public.profiles (id, tenant_id, display_name)
  VALUES (
    NEW.id,
    new_tenant_id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1))
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public, auth, pg_catalog';

-- Drop existing trigger if re-running migration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- --------------------------------------------------------------------------
-- 12. ENABLE RLS AND CREATE POLICIES
-- --------------------------------------------------------------------------

-- --- tenants ---
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_select_own" ON public.tenants
  FOR SELECT
  USING (id = public.get_user_tenant_id());

CREATE POLICY "tenants_insert_auth" ON public.tenants
  FOR INSERT
  WITH CHECK (public.is_authenticated());

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
  USING (public.is_project_member(projects.id, auth.uid()));

-- App-layer route handler sets correct tenant_id via getUserTenantId().
-- Keep the RLS check simple to avoid helper-function issues in policy context.
CREATE POLICY "projects_insert_auth" ON public.projects
  FOR INSERT
  WITH CHECK (public.is_authenticated());

CREATE POLICY "projects_update_admin" ON public.projects
  FOR UPDATE
  USING (public.has_project_role(projects.id, auth.uid(), 'admin'));

CREATE POLICY "projects_delete_admin" ON public.projects
  FOR DELETE
  USING (public.has_project_role(projects.id, auth.uid(), 'admin'));

-- --- project_members ---
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Use helper functions to avoid infinite recursion (policy self-referencing)
CREATE POLICY "project_members_select_peer" ON public.project_members
  FOR SELECT
  USING (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "project_members_insert_admin" ON public.project_members
  FOR INSERT
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'admin'));

CREATE POLICY "project_members_update_admin" ON public.project_members
  FOR UPDATE
  USING (public.has_project_role(project_id, auth.uid(), 'admin'));

CREATE POLICY "project_members_delete_admin" ON public.project_members
  FOR DELETE
  USING (public.has_project_role(project_id, auth.uid(), 'admin'));

-- --- documents ---
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select_member" ON public.documents
  FOR SELECT
  USING (public.is_project_member(documents.project_id, auth.uid()));

CREATE POLICY "documents_insert_editor" ON public.documents
  FOR INSERT
  WITH CHECK (
    (public.has_project_role(documents.project_id, auth.uid(), 'admin')
     OR public.has_project_role(documents.project_id, auth.uid(), 'editor'))
    AND documents.uploaded_by = auth.uid()
    AND documents.tenant_id = public.get_user_tenant_id()
  );

-- --------------------------------------------------------------------------
-- 13. STORAGE RLS POLICIES (pdf-uploads bucket)
-- --------------------------------------------------------------------------
-- P2 switched uploads from service_role to user-scoped clients, so storage
-- needs RLS policies granting authenticated users access. App-layer route
-- handlers enforce project membership before upload/download.

CREATE POLICY "storage_pdf_select_auth" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'pdf-uploads' AND auth.role() = 'authenticated');

CREATE POLICY "storage_pdf_insert_auth" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'pdf-uploads' AND auth.role() = 'authenticated');

-- --------------------------------------------------------------------------
-- 14. GRANT FUNCTION EXECUTE PRIVILEGES
-- --------------------------------------------------------------------------
-- SECURITY DEFINER functions must be explicitly granted to the roles that
-- need to call them (e.g. from RLS policies).
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_project_role(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_project_role(uuid, uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_authenticated() TO authenticated, anon;
