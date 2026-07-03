-- ============================================================================
-- TrustVault P17: Usage Tracking + Billing System
-- Migration: 20260704000000_p17_usage_billing.sql
-- Prerequisite: 20260703000002_p16_agents.sql
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. ADD BILLING / USAGE COLUMNS TO tenants
-- --------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'
  CHECK (plan IN ('free', 'pro', 'enterprise'));

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS usage_documents bigint NOT NULL DEFAULT 0;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS usage_llm_calls bigint NOT NULL DEFAULT 0;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS usage_storage_bytes bigint NOT NULL DEFAULT 0;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS usage_reset_at timestamptz NULL DEFAULT NULL;

-- --------------------------------------------------------------------------
-- 2. CREATE llm_usage_log TABLE (audit trail)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.llm_usage_log (
  id            uuid          NOT NULL DEFAULT gen_random_uuid(),
  tenant_id     uuid          NOT NULL,
  endpoint      text          NOT NULL,   -- e.g. 'compare', 'assistant/chat', 'agents/chat'
  tokens_used   integer       NOT NULL DEFAULT 0,
  created_at    timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT llm_usage_log_pkey PRIMARY KEY (id),
  CONSTRAINT llm_usage_log_tenant_id_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS llm_usage_log_tenant_id_idx
  ON public.llm_usage_log (tenant_id);

CREATE INDEX IF NOT EXISTS llm_usage_log_created_at_idx
  ON public.llm_usage_log (created_at DESC);

-- --------------------------------------------------------------------------
-- 3. RLS POLICIES FOR llm_usage_log
-- --------------------------------------------------------------------------
ALTER TABLE public.llm_usage_log ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant members can see their own tenant's usage log
CREATE POLICY "llm_usage_log_select_tenant" ON public.llm_usage_log
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

-- INSERT: service-role only (route handlers use service client)
-- No user-scoped insert policy — all inserts go through service-role client

-- --------------------------------------------------------------------------
-- 4. TENANTS RLS: allow SELECT of usage columns
-- --------------------------------------------------------------------------
-- Existing tenants_select_own policy already covers SELECT *.
-- Tenants do not have user-scoped UPDATE — plan updates are admin-only via service-role.

-- --------------------------------------------------------------------------
-- 5. ATOMIC USAGE INCREMENT FUNCTION (RPC)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_tenant_usage(
  p_tenant_id uuid,
  p_documents int DEFAULT 0,
  p_llm_calls int DEFAULT 0,
  p_storage_bytes bigint DEFAULT 0
)
RETURNS void AS $$
BEGIN
  UPDATE public.tenants
  SET
    usage_documents = usage_documents + p_documents,
    usage_llm_calls = usage_llm_calls + p_llm_calls,
    usage_storage_bytes = usage_storage_bytes + p_storage_bytes,
    usage_reset_at = COALESCE(usage_reset_at, date_trunc('month', now()) + interval '1 month')
  WHERE id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
