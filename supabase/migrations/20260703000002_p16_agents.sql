-- ============================================================================
-- TrustVault P16: Custom AI Agents + Multi-Channel Integration
-- Migration: 20260703000002_p16_agents.sql
-- Prerequisite: 20260703000000_p14_rbac_invitations.sql
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. CREATE agents TABLE
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agents (
  id              uuid          NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       uuid          NOT NULL,
  name            text          NOT NULL,
  system_prompt   text          NOT NULL,
  created_by      uuid          NOT NULL,
  is_active       boolean       NOT NULL DEFAULT true,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT agents_pkey PRIMARY KEY (id),
  CONSTRAINT agents_tenant_id_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT agents_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agents_tenant_id_idx ON public.agents (tenant_id);
CREATE INDEX IF NOT EXISTS agents_created_by_idx ON public.agents (created_by);

-- --------------------------------------------------------------------------
-- 2. CREATE agent_documents JUNCTION TABLE
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_documents (
  agent_id      uuid  NOT NULL,
  document_id   uuid  NOT NULL,

  CONSTRAINT agent_documents_pkey PRIMARY KEY (agent_id, document_id),
  CONSTRAINT agent_documents_agent_id_fkey FOREIGN KEY (agent_id)
    REFERENCES public.agents(id) ON DELETE CASCADE,
  CONSTRAINT agent_documents_document_id_fkey FOREIGN KEY (document_id)
    REFERENCES public.documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_documents_document_id_idx
  ON public.agent_documents (document_id);

-- --------------------------------------------------------------------------
-- 3. CREATE agent_channels TABLE
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_channels (
  id            uuid          NOT NULL DEFAULT gen_random_uuid(),
  agent_id      uuid          NOT NULL,
  channel_type  text          NOT NULL CHECK (channel_type IN ('whatsapp', 'telegram')),
  config        jsonb         NOT NULL DEFAULT '{}'::jsonb,
  is_active     boolean       NOT NULL DEFAULT true,
  created_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT agent_channels_pkey PRIMARY KEY (id),
  CONSTRAINT agent_channels_agent_id_fkey FOREIGN KEY (agent_id)
    REFERENCES public.agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_channels_agent_id_idx
  ON public.agent_channels (agent_id);

-- --------------------------------------------------------------------------
-- 4. CREATE agent_sessions TABLE
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_sessions (
  id            uuid          NOT NULL DEFAULT gen_random_uuid(),
  agent_id      uuid          NOT NULL,
  user_id       uuid          NOT NULL,
  title         text          NOT NULL DEFAULT 'New Chat',
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT agent_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT agent_sessions_agent_id_fkey FOREIGN KEY (agent_id)
    REFERENCES public.agents(id) ON DELETE CASCADE,
  CONSTRAINT agent_sessions_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_sessions_agent_user_idx
  ON public.agent_sessions (agent_id, user_id);

CREATE INDEX IF NOT EXISTS agent_sessions_updated_at_idx
  ON public.agent_sessions (updated_at DESC);

-- --------------------------------------------------------------------------
-- 5. CREATE agent_messages TABLE
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_messages (
  id                uuid          NOT NULL DEFAULT gen_random_uuid(),
  agent_id          uuid          NOT NULL,
  session_id        uuid          NOT NULL,
  role              text          NOT NULL CHECK (role IN ('user', 'assistant')),
  content           text          NOT NULL,
  channel           text          NULL DEFAULT NULL
                      CHECK (channel IS NULL OR channel IN ('whatsapp', 'telegram')),
  external_user_id  text          NULL DEFAULT NULL,
  citations         jsonb         NULL DEFAULT NULL,
  created_at        timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT agent_messages_pkey PRIMARY KEY (id),
  CONSTRAINT agent_messages_agent_id_fkey FOREIGN KEY (agent_id)
    REFERENCES public.agents(id) ON DELETE CASCADE,
  CONSTRAINT agent_messages_session_id_fkey FOREIGN KEY (session_id)
    REFERENCES public.agent_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_messages_session_id_idx
  ON public.agent_messages (session_id, created_at);

CREATE INDEX IF NOT EXISTS agent_messages_agent_channel_idx
  ON public.agent_messages (agent_id, channel, external_user_id);

-- --------------------------------------------------------------------------
-- 6. RLS POLICIES
-- --------------------------------------------------------------------------

-- --- agents ---
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_select_tenant" ON public.agents
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "agents_insert_editor" ON public.agents
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );

CREATE POLICY "agents_update_editor" ON public.agents
  FOR UPDATE
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "agents_delete_editor" ON public.agents
  FOR DELETE
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );

-- --- agent_documents ---
ALTER TABLE public.agent_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_documents_select_tenant" ON public.agent_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_documents.agent_id
        AND a.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "agent_documents_insert_editor" ON public.agent_documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_documents.agent_id
        AND a.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );

CREATE POLICY "agent_documents_delete_editor" ON public.agent_documents
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_documents.agent_id
        AND a.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );

-- --- agent_channels ---
ALTER TABLE public.agent_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_channels_select_tenant" ON public.agent_channels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_channels.agent_id
        AND a.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "agent_channels_insert_editor" ON public.agent_channels
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_channels.agent_id
        AND a.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );

CREATE POLICY "agent_channels_delete_editor" ON public.agent_channels
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_channels.agent_id
        AND a.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'editor')
  );

-- --- agent_sessions ---
ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_sessions_select_own" ON public.agent_sessions
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "agent_sessions_insert_tenant" ON public.agent_sessions
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_sessions.agent_id
        AND a.tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "agent_sessions_update_own" ON public.agent_sessions
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "agent_sessions_delete_own" ON public.agent_sessions
  FOR DELETE
  USING (user_id = auth.uid());

-- --- agent_messages ---
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_messages_select_own" ON public.agent_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_sessions s
      WHERE s.id = agent_messages.session_id AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "agent_messages_insert_own" ON public.agent_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_sessions s
      WHERE s.id = agent_messages.session_id AND s.user_id = auth.uid()
    )
  );
