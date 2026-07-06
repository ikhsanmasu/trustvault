// ---------------------------------------------------------------------------
// TrustVault P23 — POST /api/stripe/billing  (GET also supported for info)
// Creates a Stripe Customer Portal session for managing an existing subscription,
// or returns billing info about the current tenant.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole, getUserTenantId } from "@/lib/supabase/auth";
import { getStripe, createBillingPortalSession } from "@/lib/stripe";
import { apiError, safeError } from "@/lib/utils";
import type { PlanType } from "@/lib/rate-limit";
import type {
  CreateBillingResponse,
  GetBillingResponse,
  BillingInfo,
  SubscriptionStatus,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// GET — return billing info for the tenant
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
): Promise<NextResponse<GetBillingResponse | { error: string; code?: string }>> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const tenantId = await getUserTenantId(supabase, user.id);
  if (!tenantId) {
    return NextResponse.json(
      { error: "User profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select(
      "plan, stripe_customer_id, stripe_subscription_id",
    )
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    return NextResponse.json(
      { error: "Tenant not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const plan = (tenant.plan as PlanType) ?? "free";

  // Resolve subscription details from Stripe (if available)
  let subscriptionStatus: SubscriptionStatus = "none";
  let currentPeriodEnd: string | null = null;
  let cancelAtPeriodEnd = false;

  const stripe = getStripe();
  if (
    stripe &&
    tenant.stripe_customer_id &&
    tenant.stripe_subscription_id
  ) {
    try {
      const sub = await stripe.subscriptions.retrieve(
        tenant.stripe_subscription_id,
      );
      // Stripe Response<T> extends T, but TypeScript may not resolve this.
      // Cast to the underlying Subscription type for property access.
      // Access Stripe response properties (snake_case matches the API).
      // The Stripe SDK Response type wraps the resource; access via type assertion.
      const s = sub as unknown as Record<string, unknown>;
      subscriptionStatus =
        (s.status as SubscriptionStatus) ?? "none";
      const periodEnd = s.current_period_end as number | null;
      currentPeriodEnd = periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null;
      cancelAtPeriodEnd = (s.cancel_at_period_end as boolean) ?? false;
    } catch {
      // Stripe lookup failed — use defaults.
    }
  }

  const billing: BillingInfo = {
    plan,
    subscriptionStatus,
    stripeCustomerId: tenant.stripe_customer_id ?? null,
    stripeSubscriptionId: tenant.stripe_subscription_id ?? null,
    currentPeriodEnd,
    cancelAtPeriodEnd,
  };

  return NextResponse.json({ billing });
}

// ---------------------------------------------------------------------------
// POST — create a Customer Portal session
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<CreateBillingResponse | { error: string; code?: string }>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. role check (only owner/admin can manage billing) ------------------
  const roleCheck = await requireTenantRole(supabase, user.id, [
    "owner",
    "admin",
  ]);
  if (!roleCheck.ok) return roleCheck.response;
  const { tenantId } = roleCheck;

  // -- 3. get tenant's Stripe customer ID -----------------------------------
  const { data: tenant } = await supabase
    .from("tenants")
    .select("stripe_customer_id")
    .eq("id", tenantId)
    .single();

  if (!tenant?.stripe_customer_id) {
    return NextResponse.json(
      {
        error: "No billing account found. Subscribe to a plan first.",
        code: "NO_CUSTOMER",
      },
      { status: 400 },
    );
  }

  // -- 4. build return URL --------------------------------------------------
  const origin = request.headers.get("origin") ?? request.nextUrl.origin;
  const returnUrl = `${origin}/billing`;

  // -- 5. create Customer Portal session -----------------------------------
  try {
    const result = await createBillingPortalSession({
      customerId: tenant.stripe_customer_id,
      returnUrl,
    });

    return NextResponse.json({ url: result.url });
  } catch (err) {
    console.error("[stripe:billing] Failed to create portal session:", err);
    return apiError(
      safeError("Failed to create billing portal session", err),
      "STRIPE_ERROR",
      500,
    ) as NextResponse<CreateBillingResponse | { error: string; code?: string }>;
  }
}
