-- ============================================================================
-- TrustVault P9: document description & notes
-- Migration: 20260701000003_p9_document_description.sql
-- ============================================================================

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
