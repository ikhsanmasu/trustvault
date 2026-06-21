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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
