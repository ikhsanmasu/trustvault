-- Enable pgcrypto for gen_random_uuid() if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- documents table
CREATE TABLE IF NOT EXISTS public.documents (
  id               uuid          NOT NULL DEFAULT gen_random_uuid(),
  name             text          NOT NULL,
  storage_path     text          NOT NULL,
  binary_hash      text          NOT NULL,
  text_hash        text          NOT NULL,
  extracted_text   text          NOT NULL DEFAULT '',
  file_size_bytes  bigint        NOT NULL,
  tenant_id        uuid          NULL DEFAULT NULL,
  NULL /* was project_id */       uuid          NULL DEFAULT NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT documents_pkey PRIMARY KEY (id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS documents_created_at_idx
  ON public.documents (created_at DESC);

CREATE INDEX IF NOT EXISTS documents_name_idx
  ON public.documents (name);

CREATE INDEX IF NOT EXISTS documents_binary_hash_idx
  ON public.documents (binary_hash);

CREATE INDEX IF NOT EXISTS documents_tenant_id_idx
  ON public.documents (tenant_id);

-- Grant permissions (service_role should have full access)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;

-- Create the storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdf-uploads',
  'pdf-uploads',
  false,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;
