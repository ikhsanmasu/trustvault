-- ============================================================================
-- TrustVault P20: Drop project_id from chat_sessions
-- ============================================================================
ALTER TABLE public.chat_sessions DROP COLUMN IF EXISTS project_id;
