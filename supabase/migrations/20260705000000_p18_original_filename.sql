-- ============================================================================
-- TrustVault P18: Original filename + optional display name
-- Migration: 20260705000000_p18_original_filename.sql
-- ============================================================================

-- 1. Add original_filename column to documents (nullable for backward compat)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS original_filename text NULL DEFAULT NULL;

-- 2. Create index for duplicate-name check queries
CREATE INDEX IF NOT EXISTS documents_tenant_name_idx
  ON public.documents (tenant_id, name)
  WHERE name IS NOT NULL AND deleted_at IS NULL;
