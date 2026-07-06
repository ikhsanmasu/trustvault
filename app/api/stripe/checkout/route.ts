// ---------------------------------------------------------------------------
// TrustVault P23 — POST /api/stripe/checkout
// Creates a Stripe Checkout Session for subscribing to a paid plan.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import { createCheckoutSession, isValidPriceId } from "@/lib/stripe";
import { apiError, safeError } from "@/lib/utils";
import type { CreateCheckoutResponse } from "@/lib/types";

export async function POST(
  request: NextRequest,
): Promise<NextResponse<CreateCheckoutResponse | { error: string; code?: string }>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. role check (only owner/admin can change plan) ---------------------
  const roleCheck = await requireTenantRole(supabase, user.id, [
    "owner",
    "admin",
  ]);
  if (!roleCheck.ok) return roleCheck.response;
  const { tenantId } = roleCheck;

  // -- 3. parse body --------------------------------------------------------
  let priceId: string;
  try {
    const body = await request.json();
    priceId = body.priceId;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_JSON" },
      { status: 400 },
    );
  }

  if (!priceId || typeof priceId !== "string") {
    return NextResponse.json(
      { error: "priceId is required", code: "MISSING_PRICE_ID" },
      { status: 400 },
    );
  }

  // Validate the price ID against the server-side allowlist to prevent
  // users from subscribing to arbitrary/unintended Stripe prices.
  if (!isValidPriceId(priceId)) {
    return NextResponse.json(
      { error: "Invalid price ID", code: "INVALID_PRICE_ID" },
      { status: 400 },
    );
  }

  // -- 4. fetch tenant name for metadata -----------------------------------
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, plan, stripe_subscription_id")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    return NextResponse.json(
      { error: "Tenant not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 5. already subscribed? ----------------------------------------------
  if (tenant.plan !== "free" && tenant.stripe_subscription_id) {
    return NextResponse.json(
      {
        error: "You already have an active subscription. Use the billing portal to manage it.",
        code: "ALREADY_SUBSCRIBED",
      },
      { status: 400 },
    );
  }

  // -- 6. build success/cancel URLs ----------------------------------------
  // Use the configured app URL if set, otherwise derive from the request.
  // The `request.nextUrl.origin` is safer than the `Origin` request header
  // (which the client controls) — it uses the Host header that the server
  // received the request on.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const successUrl = `${baseUrl}/billing?checkout=success`;
  const cancelUrl = `${baseUrl}/billing?checkout=canceled`;

  // -- 7. create Stripe Checkout Session -----------------------------------
  try {
    const result = await createCheckoutSession({
      priceId,
      tenantId,
      tenantName: tenant.name ?? "Untitled Workspace",
      userEmail: user.email ?? "",
      successUrl,
      cancelUrl,
    });

    return NextResponse.json({ url: result.url });
  } catch (err) {
    console.error("[stripe:checkout] Failed to create checkout session:", err);
    return apiError(
      safeError("Failed to create checkout session", err),
      "STRIPE_ERROR",
      500,
    ) as NextResponse<CreateCheckoutResponse | { error: string; code?: string }>;
  }
}
