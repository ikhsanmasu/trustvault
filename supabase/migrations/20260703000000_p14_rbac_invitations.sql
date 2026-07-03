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
-- NOTE: Also drops the permissive "documents_update" policy left over from P2
-- (P11 forgot to clean it up when replacing project-scoped policies).
DROP POLICY IF EXISTS "documents_update" ON public.documents;
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
