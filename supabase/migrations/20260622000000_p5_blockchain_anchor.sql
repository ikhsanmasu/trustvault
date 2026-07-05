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
--    Postgres 15+ treats NULLs as distinct by default for unique constraints,
--    so multiple rows with NULL fingerprint coexist fine.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documents_fingerprint_unique'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_fingerprint_unique UNIQUE (fingerprint);
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 3. INDEXES
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS documents_chain_idx ON public.documents (chain);

CREATE INDEX IF NOT EXISTS documents_anchored_at_idx ON public.documents (anchored_at DESC);

-- --------------------------------------------------------------------------
-- 4. UPDATE RLS POLICY (documents were previously INSERT+SELECT only)
--    P5 needs an UPDATE policy so that POST /api/anchor can set the anchoring
--    columns. The same role check as INSERT applies: admin or editor.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'documents'
      AND policyname = 'documents_update_anchor'
  ) THEN
    CREATE POLICY "documents_update_anchor" ON public.documents
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.project_members
          WHERE NULL /* was project_id */ = documents.NULL /* was project_id */
            AND user_id = auth.uid()
            AND role IN ('admin', 'editor')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.project_members
          WHERE NULL /* was project_id */ = documents.NULL /* was project_id */
            AND user_id = auth.uid()
            AND role IN ('admin', 'editor')
        )
      );
  END IF;
END $$;
