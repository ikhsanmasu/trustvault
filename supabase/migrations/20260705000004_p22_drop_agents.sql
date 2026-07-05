-- ============================================================================
-- TrustVault P22: Drop the AI Agents + multi-channel feature (product refocus)
-- Migration: 20260705000004_p22_drop_agents.sql
-- Prerequisite: 20260705000003_p21_atomic_usage_and_hardening.sql
-- ============================================================================
-- The custom-agents feature (P16: tenant-built chatbots with WhatsApp/Telegram
-- channels) has been removed from the product. It sat outside the core
-- document-integrity vision, and every route, page, and library backing it has
-- been deleted from the codebase. This migration removes its tables.
--
-- Historical LLM usage rows in llm_usage_log with agent endpoints are kept —
-- they are billing history, not feature data.
-- ============================================================================

DROP TABLE IF EXISTS public.agent_messages CASCADE;
DROP TABLE IF EXISTS public.agent_sessions CASCADE;
DROP TABLE IF EXISTS public.agent_channels CASCADE;
DROP TABLE IF EXISTS public.agent_documents CASCADE;
DROP TABLE IF EXISTS public.agents CASCADE;
