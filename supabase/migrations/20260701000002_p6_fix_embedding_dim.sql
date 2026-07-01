-- ============================================================================
-- TrustVault P6 fix: alter embedding dimension from 384 to 1536
-- Migration: 20260701000002_p6_fix_embedding_dim.sql
-- Prerequisite: 20260701000001_p7_p8_analytics_sharing.sql
-- ============================================================================

-- Remove any chunks with old 384-dim embeddings (will be re-ingested)
DELETE FROM public.document_chunks;

-- Drop the old IVFFlat index
DROP INDEX IF EXISTS document_chunks_embedding_idx;

-- Alter column type from vector(384) to vector(1536)
ALTER TABLE public.document_chunks
  ALTER COLUMN embedding TYPE vector(1536);

-- Recreate the IVFFlat index
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON public.document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
