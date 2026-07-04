-- ============================================================================
-- TrustVault P19: Database Hardening — Tighten RLS, Fix Policies, Add Constraints
-- Migration: 20260705000001_p19_db_hardening.sql
-- Prerequisite: 20260704000000_p17_usage_billing.sql
-- ============================================================================
-- This migration:
--   1. Tightens permissive RLS policies on tenants, profiles, documents SELECT, storage
--   2. Fixes shared_links policies that lacked cross-tenant checks
--   3. Adds agent_channels unique constraint on (agent_id, channel_type)
--   4. Adds performance composite indexes
--   5. Fixes handle_new_user trigger (removes PII leak from email)
--   6. Adds updated_at auto-trigger for tables with lifecycle timestamps
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. TIGHTEN tenants RLS — replace permissive USING (true)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "tenants_select_own" ON public.tenants;
CREATE POLICY "tenants_select_own" ON public.tenants
  FOR SELECT
  USING (id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "tenants_insert_auth" ON public.tenants;
CREATE POLICY "tenants_insert_auth" ON public.tenants
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- --------------------------------------------------------------------------
-- 2. TIGHTEN profiles RLS — replace permissive USING (true)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- --------------------------------------------------------------------------
-- 3. TIGHTEN documents SELECT — replace permissive USING (true)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "documents_select_member" ON public.documents;
CREATE POLICY "documents_select_tenant" ON public.documents
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- --------------------------------------------------------------------------
-- 4. TIGHTEN storage RLS — replace permissive USING (true)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "storage_pdf_select_auth" ON storage.objects;
CREATE POLICY "storage_pdf_select_auth" ON storage.objects
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "storage_pdf_insert_auth" ON storage.objects;
CREATE POLICY "storage_pdf_insert_auth" ON storage.objects
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- --------------------------------------------------------------------------
-- 5. FIX shared_links UPDATE/DELETE: add tenant-scope check for admin roles
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "shared_links_update_own_or_admin" ON public.shared_links;
CREATE POLICY "shared_links_update_own_or_admin" ON public.shared_links
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin')
      AND EXISTS (
        SELECT 1 FROM public.profiles creator
        WHERE creator.id = shared_links.created_by
          AND creator.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "shared_links_delete_own_or_admin" ON public.shared_links;
CREATE POLICY "shared_links_delete_own_or_admin" ON public.shared_links
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin')
      AND EXISTS (
        SELECT 1 FROM public.profiles creator
        WHERE creator.id = shared_links.created_by
          AND creator.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
      )
    )
  );

-- --------------------------------------------------------------------------
-- 6. ADD UNIQUE CONSTRAINT: agent_channels (agent_id, channel_type)
--    Prevents duplicate channel connections from concurrent requests.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_channels_agent_channel_unique'
  ) THEN
    -- Deduplicate existing rows before adding unique constraint
    DELETE FROM public.agent_channels a
    WHERE a.id NOT IN (
      SELECT MIN(id) FROM public.agent_channels
      WHERE agent_id IS NOT NULL
      GROUP BY agent_id, channel_type
    );
    ALTER TABLE public.agent_channels
      ADD CONSTRAINT agent_channels_agent_channel_unique UNIQUE (agent_id, channel_type);
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 7. COMPOSITE INDEX: documents(tenant_id, created_at DESC)
--    Optimises the most common query: "list my tenant's documents, newest first"
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS documents_tenant_created_at_idx
  ON public.documents (tenant_id, created_at DESC);

-- --------------------------------------------------------------------------
-- 8. FIX handle_new_user TRIGGER — use display name from metadata instead of raw email
--    PII: email should not be stored as tenant name or display_name
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_tenant_id uuid;
  display_name_val text;
  tenant_name_val text;
BEGIN
  -- Use full_name metadata if available; fall back to email local-part
  display_name_val := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    split_part(NEW.email, '@', 1)
  );
  tenant_name_val := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'tenant_name'), ''),
    display_name_val || '''s Workspace'
  );

  INSERT INTO public.tenants (name) VALUES (tenant_name_val)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.profiles (id, tenant_id, display_name, role)
  VALUES (NEW.id, new_tenant_id, display_name_val, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public, auth, pg_catalog';

-- --------------------------------------------------------------------------
-- 9. ADD updated_at AUTO-TRIGGER
--    Tables with updated_at get automatic timestamp updates on row modification.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to agents (already has updated_at column)
DROP TRIGGER IF EXISTS trg_agents_updated_at ON public.agents;
CREATE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Apply to agent_sessions (already has updated_at column)
DROP TRIGGER IF EXISTS trg_agent_sessions_updated_at ON public.agent_sessions;
CREATE TRIGGER trg_agent_sessions_updated_at
  BEFORE UPDATE ON public.agent_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Apply to chat_sessions (already has updated_at column)
DROP TRIGGER IF EXISTS trg_chat_sessions_updated_at ON public.chat_sessions;
CREATE TRIGGER trg_chat_sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
