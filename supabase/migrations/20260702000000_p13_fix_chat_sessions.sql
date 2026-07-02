-- ============================================================================
-- TrustVault P13: Fix chat_sessions after projects table dropped
-- ============================================================================

-- Drop old FK and make project_id nullable
ALTER TABLE public.chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_project_id_fkey;
ALTER TABLE public.chat_sessions ALTER COLUMN project_id DROP NOT NULL;

-- Fix RLS: remove project_members dependency
DROP POLICY IF EXISTS "chat_sessions_insert_member" ON public.chat_sessions;
CREATE POLICY "chat_sessions_insert_member" ON public.chat_sessions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
