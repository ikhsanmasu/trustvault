-- ============================================================================
-- TrustVault P10: Labels system (multi-label, inline creation)
-- Migration: 20260701000004_p10_labels.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.labels (
  id          uuid          NOT NULL DEFAULT gen_random_uuid(),
  tenant_id   uuid          NOT NULL,
  name        text          NOT NULL,
  color       text          NOT NULL DEFAULT '#6366f1',
  created_at  timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT labels_pkey PRIMARY KEY (id),
  CONSTRAINT labels_tenant_name_unique UNIQUE (tenant_id, name),
  CONSTRAINT labels_tenant_id_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.document_labels (
  document_id uuid NOT NULL,
  label_id    uuid NOT NULL,

  CONSTRAINT document_labels_pkey PRIMARY KEY (document_id, label_id),
  CONSTRAINT document_labels_document_fkey FOREIGN KEY (document_id)
    REFERENCES public.documents(id) ON DELETE CASCADE,
  CONSTRAINT document_labels_label_fkey FOREIGN KEY (label_id)
    REFERENCES public.labels(id) ON DELETE CASCADE
);

-- RLS: labels visible to same tenant
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labels_select_tenant" ON public.labels
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "labels_insert_tenant" ON public.labels
  FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- RLS: document_labels visible if user can see the document
ALTER TABLE public.document_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_labels_select_member" ON public.document_labels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.project_members pm ON pm.NULL /* was project_id */ = d.NULL /* was project_id */ AND pm.user_id = auth.uid()
      WHERE d.id = document_labels.document_id
    )
  );

CREATE POLICY "document_labels_insert_editor" ON public.document_labels
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.project_members pm ON pm.NULL /* was project_id */ = d.NULL /* was project_id */ AND pm.user_id = auth.uid()
      WHERE d.id = document_labels.document_id AND pm.role IN ('admin', 'editor')
    )
  );

CREATE POLICY "document_labels_delete_editor" ON public.document_labels
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.project_members pm ON pm.NULL /* was project_id */ = d.NULL /* was project_id */ AND pm.user_id = auth.uid()
      WHERE d.id = document_labels.document_id AND pm.role IN ('admin', 'editor')
    )
  );
