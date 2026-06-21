-- ============================================================================
-- TrustVault P3: Multi-format file support, file_type column, updated storage
-- Migration: 20260621000002_p3_multiformat.sql
-- Prerequisite: 20260621000001_p2_auth_rbac.sql (P2 auth + RBAC)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. ADD file_type COLUMN TO documents
-- --------------------------------------------------------------------------
-- Existing rows (all PDFs from P1/P2) get the default 'application/pdf'.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS file_type text NOT NULL DEFAULT 'application/pdf';

-- --------------------------------------------------------------------------
-- 2. ADD INDEX ON file_type FOR VAULT FILTERING
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS documents_file_type_idx ON public.documents (file_type);

-- --------------------------------------------------------------------------
-- 3. UPDATE STORAGE BUCKET ALLOWED MIME TYPES
-- --------------------------------------------------------------------------
-- Update the pdf-uploads bucket to accept all 13 supported MIME types.
-- The bucket name is retained for backward compatibility.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
  'text/xml',
  'application/json',
  'application/xml',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/msword',
  'application/rtf',
  'application/vnd.oasis.opendocument.text'
]
WHERE id = 'pdf-uploads';
