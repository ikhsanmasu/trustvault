-- TrustVault P4: Soft delete support — keeps hash data, marks row as deleted
-- Migration: 20260621000003_p4_soft_delete.sql

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL DEFAULT NULL;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL DEFAULT NULL;

CREATE INDEX IF NOT EXISTS documents_deleted_at_idx ON public.documents (deleted_at);
