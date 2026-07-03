-- ============================================================================
-- TrustVault P12: Deep clean — drop projects, project_members, unused columns
-- ============================================================================

-- 0. Drop RLS policies that reference project_id columns first
DROP POLICY IF EXISTS "document_chunks_select_member" ON public.document_chunks;
DROP POLICY IF EXISTS "document_chunks_insert_editor" ON public.document_chunks;
DROP POLICY IF EXISTS "document_chunks_delete_editor" ON public.document_chunks;
DROP POLICY IF EXISTS "document_labels_select_member" ON public.document_labels;
DROP POLICY IF EXISTS "document_labels_insert_editor" ON public.document_labels;
DROP POLICY IF EXISTS "document_labels_delete_editor" ON public.document_labels;

-- 1. Remove project_id from documents (already nullable from P11, now drop it)
ALTER TABLE public.documents DROP COLUMN IF EXISTS project_id;

-- 2. Remove project_id from document_chunks (drop index first)
DROP INDEX IF EXISTS document_chunks_project_id_idx;
ALTER TABLE public.document_chunks DROP COLUMN IF EXISTS project_id;

-- 3. Remove project_id from shared_links (make nullable first if needed)
DO $$ BEGIN
  ALTER TABLE public.shared_links ALTER COLUMN project_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
ALTER TABLE public.shared_links DROP COLUMN IF EXISTS project_id;

-- 4. Drop project_members table (CASCADE removes FK references)
DROP TABLE IF EXISTS public.project_members CASCADE;

-- 5. Drop projects table
DROP TABLE IF EXISTS public.projects CASCADE;

-- 6. Remove project-scoped indexes
DROP INDEX IF EXISTS documents_project_id_idx;
