-- ============================================================================
-- TrustVault P11: Make NULL /* was project_id */ optional everywhere
-- ============================================================================

-- 1. document_chunks: drop NOT NULL on NULL /* was project_id */
ALTER TABLE public.document_chunks
  ALTER COLUMN NULL /* was project_id */ DROP NOT NULL;

-- 2. documents: drop NOT NULL + FK on NULL /* was project_id */
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_NULL /* was project_id */_fkey,
  ALTER COLUMN NULL /* was project_id */ DROP NOT NULL;

-- 3. Drop old project-scoped RLS policies (will be recreated by backend)
DROP POLICY IF EXISTS "documents_select_member" ON public.documents;
DROP POLICY IF EXISTS "documents_insert_editor" ON public.documents;
DROP POLICY IF EXISTS "documents_update_anchor" ON public.documents;
DROP POLICY IF EXISTS "document_chunks_select_member" ON public.document_chunks;
DROP POLICY IF EXISTS "document_chunks_insert_editor" ON public.document_chunks;
DROP POLICY IF EXISTS "document_chunks_delete_editor" ON public.document_chunks;

-- 4. New simpler RLS: any authenticated user in the same tenant can access documents
CREATE POLICY "documents_tenant_access" ON public.documents
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "documents_tenant_insert" ON public.documents
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "documents_tenant_update" ON public.documents
  FOR UPDATE
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- 5. Document chunks: tenant-scoped (join through documents)
CREATE POLICY "document_chunks_tenant_access" ON public.document_chunks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_chunks.document_id
        AND d.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "document_chunks_tenant_insert" ON public.document_chunks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_chunks.document_id
        AND d.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "document_chunks_tenant_delete" ON public.document_chunks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_chunks.document_id
        AND d.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
  );
