-- ============================================================================
-- TrustVault P6: AI Vault Assistant (pgvector + chat)
-- Migration: 20260701000000_p6_ai_assistant.sql
-- Prerequisite: 20260622000000_p5_blockchain_anchor.sql
-- Embedding: all-MiniLM-L6-v2 (384 dims, local ONNX via @xenova/transformers)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. ENABLE pgvector EXTENSION
-- --------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- --------------------------------------------------------------------------
-- 2. DOCUMENT CHUNKS TABLE (for RAG embeddings)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_chunks (
  id            uuid          NOT NULL DEFAULT gen_random_uuid(),
  document_id   uuid          NOT NULL,
  project_id    uuid          NOT NULL,
  chunk_index   integer       NOT NULL,
  content       text          NOT NULL,
  embedding     vector(384)  NULL DEFAULT NULL,
  token_count   integer       NOT NULL DEFAULT 0,
  created_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT document_chunks_pkey PRIMARY KEY (id),
  CONSTRAINT document_chunks_document_id_fkey FOREIGN KEY (document_id)
    REFERENCES public.documents(id) ON DELETE CASCADE,
  CONSTRAINT document_chunks_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES public.projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx
  ON public.document_chunks (document_id);

CREATE INDEX IF NOT EXISTS document_chunks_project_id_idx
  ON public.document_chunks (project_id);

-- IVFFlat index for cosine similarity search on embeddings.
-- Lists = 100 is suitable for up to ~1 million chunks.
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON public.document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- --------------------------------------------------------------------------
-- 3. CHAT SESSIONS TABLE
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id            uuid          NOT NULL DEFAULT gen_random_uuid(),
  project_id    uuid          NOT NULL,
  user_id       uuid          NOT NULL,
  title         text          NOT NULL DEFAULT 'New Chat',
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT chat_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT chat_sessions_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT chat_sessions_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS chat_sessions_project_user_idx
  ON public.chat_sessions (project_id, user_id);

CREATE INDEX IF NOT EXISTS chat_sessions_updated_at_idx
  ON public.chat_sessions (updated_at DESC);

-- --------------------------------------------------------------------------
-- 4. CHAT MESSAGES TABLE
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id            uuid          NOT NULL DEFAULT gen_random_uuid(),
  session_id    uuid          NOT NULL,
  role          text          NOT NULL CHECK (role IN ('user', 'assistant')),
  content       text          NOT NULL,
  citations     jsonb         NULL DEFAULT NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_session_id_fkey FOREIGN KEY (session_id)
    REFERENCES public.chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS chat_messages_session_id_idx
  ON public.chat_messages (session_id, created_at);

-- --------------------------------------------------------------------------
-- 5. RLS POLICIES
-- --------------------------------------------------------------------------

-- --- document_chunks ---
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_chunks_select_member" ON public.document_chunks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = document_chunks.project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "document_chunks_insert_editor" ON public.document_chunks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = document_chunks.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
  );

CREATE POLICY "document_chunks_delete_editor" ON public.document_chunks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = document_chunks.project_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    )
  );

-- --- chat_sessions ---
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_sessions_select_own" ON public.chat_sessions
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "chat_sessions_insert_member" ON public.chat_sessions
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_id = chat_sessions.project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "chat_sessions_update_own" ON public.chat_sessions
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "chat_sessions_delete_own" ON public.chat_sessions
  FOR DELETE
  USING (user_id = auth.uid());

-- --- chat_messages ---
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_select_own" ON public.chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions
      WHERE id = chat_messages.session_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "chat_messages_insert_own" ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_sessions
      WHERE id = chat_messages.session_id AND user_id = auth.uid()
    )
  );
