-- ============================================================================
-- TrustVault P7: Dashboard Analytics + P8: Document Sharing
-- Migration: 20260701000001_p7_p8_analytics_sharing.sql
-- Prerequisite: 20260701000000_p6_ai_assistant.sql
-- ============================================================================

-- --------------------------------------------------------------------------
-- P8: SHARED LINKS TABLE — public document sharing
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shared_links (
  id              uuid          NOT NULL DEFAULT gen_random_uuid(),
  project_id      uuid          NOT NULL,
  document_ids    uuid[]        NOT NULL DEFAULT '{}',
  token           text          NOT NULL,
  created_by      uuid          NOT NULL,
  allow_download  boolean       NOT NULL DEFAULT true,
  allow_chat      boolean       NOT NULL DEFAULT true,
  title           text          NOT NULL DEFAULT 'Shared Documents',
  is_active       boolean       NOT NULL DEFAULT true,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  expires_at      timestamptz   NULL DEFAULT NULL,

  CONSTRAINT shared_links_pkey PRIMARY KEY (id),
  CONSTRAINT shared_links_token_unique UNIQUE (token),
  CONSTRAINT shared_links_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT shared_links_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shared_links_project_id_idx
  ON public.shared_links (project_id);

CREATE INDEX IF NOT EXISTS shared_links_token_idx
  ON public.shared_links (token);

-- --------------------------------------------------------------------------
-- P8: RLS — shared_links
-- --------------------------------------------------------------------------
ALTER TABLE public.shared_links ENABLE ROW LEVEL SECURITY;

-- Members of the project can see share links
CREATE POLICY "shared_links_select_member" ON public.shared_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = shared_links.project_id AND user_id = auth.uid()
    )
  );

-- Editors and admins can create share links
CREATE POLICY "shared_links_insert_editor" ON public.shared_links
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = shared_links.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
  );

-- Editors and admins can update/revoke their own share links
CREATE POLICY "shared_links_update_editor" ON public.shared_links
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = shared_links.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
  );

CREATE POLICY "shared_links_delete_editor" ON public.shared_links
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = shared_links.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
  );
