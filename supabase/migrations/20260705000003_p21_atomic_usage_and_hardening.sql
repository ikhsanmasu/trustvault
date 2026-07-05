-- ============================================================================
-- TrustVault P21: Atomic usage consumption, DB-backed rate limiting,
--                 storage bucket lockdown
-- Migration: 20260705000003_p21_atomic_usage_and_hardening.sql
-- Prerequisite: 20260705000001_p19_db_hardening.sql
-- ============================================================================
-- This migration:
--   1. Adds try_consume_tenant_usage(): checks plan limits and increments
--      usage counters in a single UPDATE, closing the check-then-increment
--      race where concurrent requests could exceed plan quotas.
--   2. Adds rate_limits + check_rate_limit(): a fixed-window rate limiter
--      for public endpoints that works across serverless instances (an
--      in-memory limiter resets on every cold start and is per-instance).
--   3. Locks the storage bucket down to the service role. All storage access
--      goes through API routes that perform explicit tenant checks; the
--      previous "any authenticated user" policies allowed cross-tenant object
--      reads for anyone holding a valid session and an object path.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. ATOMIC USAGE CONSUMPTION
--    NULL limit parameters mean "unlimited". Returns true when the usage was
--    consumed, false when any limit would be exceeded (no counters change).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.try_consume_tenant_usage(
  p_tenant_id uuid,
  p_documents int DEFAULT 0,
  p_llm_calls int DEFAULT 0,
  p_storage_bytes bigint DEFAULT 0,
  p_max_documents int DEFAULT NULL,
  p_max_llm_calls int DEFAULT NULL,
  p_max_storage_bytes bigint DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  updated_rows int;
BEGIN
  UPDATE public.tenants
  SET
    usage_documents = usage_documents + p_documents,
    usage_llm_calls = usage_llm_calls + p_llm_calls,
    usage_storage_bytes = usage_storage_bytes + p_storage_bytes,
    usage_reset_at = COALESCE(usage_reset_at, date_trunc('month', now()) + interval '1 month')
  WHERE id = p_tenant_id
    AND (p_max_documents IS NULL OR usage_documents + p_documents <= p_max_documents)
    AND (p_max_llm_calls IS NULL OR usage_llm_calls + p_llm_calls <= p_max_llm_calls)
    AND (p_max_storage_bytes IS NULL OR usage_storage_bytes + p_storage_bytes <= p_max_storage_bytes);

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public, pg_catalog';

-- --------------------------------------------------------------------------
-- 2. DB-BACKED RATE LIMITING FOR PUBLIC ENDPOINTS (fixed window)
--    RLS enabled with no policies: only the service role can touch the table.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  count int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max int,
  p_window_seconds int
)
RETURNS TABLE (allowed boolean, remaining int, reset_at timestamptz) AS $$
BEGIN
  -- Opportunistic cleanup of long-expired windows (table stays tiny: one row
  -- per rate-limit key, so a full scan here is cheap).
  DELETE FROM public.rate_limits r
  WHERE r.window_start < now() - interval '1 day';

  RETURN QUERY
  INSERT INTO public.rate_limits AS r (key, count, window_start)
  VALUES (p_key, 1, now())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN now() - r.window_start >= make_interval(secs => p_window_seconds) THEN 1
      ELSE r.count + 1
    END,
    window_start = CASE
      WHEN now() - r.window_start >= make_interval(secs => p_window_seconds) THEN now()
      ELSE r.window_start
    END
  RETURNING
    r.count <= p_max,
    greatest(p_max - r.count, 0),
    r.window_start + make_interval(secs => p_window_seconds);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public, pg_catalog';

-- --------------------------------------------------------------------------
-- 3. STORAGE BUCKET LOCKDOWN — service role only
--    Storage object paths are not tenant-prefixed (uploads/{year}/{uuid}),
--    so path-based tenant RLS is not possible for existing objects. All
--    reads/writes go through API routes that enforce auth + tenant
--    membership and use the service-role client; direct client access is
--    removed entirely.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "storage_pdf_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "storage_pdf_insert_auth" ON storage.objects;
