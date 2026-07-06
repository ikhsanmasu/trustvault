-- ============================================================================
-- TrustVault P23: Stripe Payment Integration
-- Migration: 20260706000000_p23_stripe.sql
-- Prerequisite: 20260704000000_p17_usage_billing.sql
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. ADD STRIPE COLUMNS TO tenants
-- --------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id text NULL;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text NULL;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stripe_price_id text NULL;

-- --------------------------------------------------------------------------
-- 2. INDEXES for Stripe lookups (webhook resolves tenant by customer_id)
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS tenants_stripe_customer_id_idx
  ON public.tenants (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenants_stripe_subscription_id_idx
  ON public.tenants (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
