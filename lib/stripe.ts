// ---------------------------------------------------------------------------
// TrustVault P23 — Stripe integration module
// ---------------------------------------------------------------------------
// Server-only Stripe client, checkout/billing session helpers, and webhook
// event handler. Follows the pattern of lib/anchor.ts (external service wrapper).
// ---------------------------------------------------------------------------

import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/client";
import type { PlanType } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** The Stripe price ID for the Pro monthly subscription. */
const PRO_PRICE_ID =
  process.env.STRIPE_PRO_PRICE_ID ?? "price_pro_monthly_placeholder";

/** Map Stripe price IDs to plan types. Used by the webhook to sync plans. */
const PRICE_TO_PLAN: Record<string, PlanType> = {
  [PRO_PRICE_ID]: "pro",
};

/** Set of known/valid Stripe price IDs that clients are allowed to subscribe to. */
const VALID_PRICE_IDS: ReadonlySet<string> = new Set(Object.keys(PRICE_TO_PLAN));

/** Returns true if the given price ID is a valid, server-recognized plan. */
export function isValidPriceId(priceId: string): boolean {
  return VALID_PRICE_IDS.has(priceId);
}

export function getPlanFromPriceId(priceId: string): PlanType | null {
  return PRICE_TO_PLAN[priceId] ?? null;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let stripe: Stripe | null = null;

/**
 * Returns a lazily-initialized Stripe server client singleton.
 * Returns `null` if STRIPE_SECRET_KEY is not configured (graceful degradation).
 */
export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-06-24.dahlia",
    });
  }
  return stripe;
}

// ---------------------------------------------------------------------------
// Checkout Session
// ---------------------------------------------------------------------------

export interface CreateCheckoutParams {
  priceId: string;
  tenantId: string;
  tenantName: string;
  userEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutResult {
  url: string;
}

/**
 * Creates a Stripe Checkout Session for subscribing to a plan.
 *
 * The tenant's UUID and name are stored in `metadata` so the webhook can
 * identify which tenant to upgrade when payment completes.
 */
export async function createCheckoutSession(
  params: CreateCheckoutParams,
): Promise<CreateCheckoutResult> {
  const s = getStripe();
  if (!s) throw new Error("Stripe is not configured");

  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer_email: params.userEmail,
    client_reference_id: params.tenantId,
    metadata: {
      tenant_id: params.tenantId,
      tenant_name: params.tenantName,
    },
    line_items: [
      {
        price: params.priceId,
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }

  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Customer Portal
// ---------------------------------------------------------------------------

export interface CreatePortalParams {
  customerId: string;
  returnUrl: string;
}

export interface CreatePortalResult {
  url: string;
}

/**
 * Creates a Stripe Customer Portal session so the user can manage their
 * subscription (update payment method, cancel, etc.).
 */
export async function createBillingPortalSession(
  params: CreatePortalParams,
): Promise<CreatePortalResult> {
  const s = getStripe();
  if (!s) throw new Error("Stripe is not configured");

  const session = await s.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });

  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

export type StripeEventType =
  | "checkout.session.completed"
  | "customer.subscription.updated"
  | "customer.subscription.deleted";

export interface WebhookResult {
  received: boolean;
  event?: string;
  error?: string;
}

/**
 * Processes a single Stripe webhook event.
 *
 * Uses the service-role client because webhooks have no user session (they
 * come from Stripe's servers). All DB operations are idempotent — safe for
 * Stripe's automatic retries.
 */
export async function processStripeEvent(
  event: Stripe.Event,
): Promise<WebhookResult> {
  const supabase = createServiceClient();
  const type = event.type as StripeEventType;

  switch (type) {
    // ------------------------------------------------------------------
    // checkout.session.completed — activate subscription
    // ------------------------------------------------------------------
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.metadata?.tenant_id;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (!tenantId || !customerId || !subscriptionId) {
        console.error(
          "[stripe] checkout.session.completed missing required fields",
          { tenantId, customerId, subscriptionId },
        );
        return { received: true, event: type, error: "Missing required fields" };
      }

      // Resolve the price ID from the line items
      const lineItems = await getStripe()?.checkout.sessions.listLineItems(
        session.id,
        { limit: 1 },
      );
      const priceId = lineItems?.data[0]?.price?.id;
      const plan = priceId ? getPlanFromPriceId(priceId) : null;

      // Reset usage counters for the new billing period
      const nextReset = new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        1,
      ).toISOString();

      const { error } = await supabase
        .from("tenants")
        .update({
          plan: plan ?? "pro",
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: priceId ?? null,
          usage_documents: 0,
          usage_llm_calls: 0,
          usage_storage_bytes: 0,
          usage_reset_at: nextReset,
        })
        .eq("id", tenantId);

      if (error) {
        console.error("[stripe] Failed to update tenant after checkout:", error);
        return { received: true, event: type, error: "DB update failed" };
      }

      console.log(
        `[stripe] Tenant ${tenantId} upgraded to ${plan ?? "pro"} (subscription: ${subscriptionId})`,
      );
      return { received: true, event: type };
    }

    // ------------------------------------------------------------------
    // customer.subscription.updated — sync plan changes
    // ------------------------------------------------------------------
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionId = subscription.id;
      const priceId = subscription.items.data[0]?.price?.id;
      const plan = priceId ? getPlanFromPriceId(priceId) : null;
      const status = subscription.status;

      // Only process if we have a known plan
      if (!plan) {
        return { received: true, event: type };
      }

      // If the subscription is no longer active, downgrade to free
      const newPlan: PlanType =
        status === "active" || status === "trialing" ? plan : "free";
      const updateData: Record<string, unknown> = { plan: newPlan };

      // If canceled/incomplete, clear the subscription ID
      if (status !== "active" && status !== "trialing") {
        updateData.stripe_subscription_id = null;
        updateData.stripe_price_id = null;
      } else {
        updateData.stripe_price_id = priceId;
      }

      const { error } = await supabase
        .from("tenants")
        .update(updateData)
        .eq("stripe_subscription_id", subscriptionId);

      if (error) {
        console.error(
          "[stripe] Failed to update tenant after subscription update:",
          error,
        );
        return { received: true, event: type, error: "DB update failed" };
      }

      console.log(
        `[stripe] Subscription ${subscriptionId} updated → plan=${newPlan}, status=${status}`,
      );
      return { received: true, event: type };
    }

    // ------------------------------------------------------------------
    // customer.subscription.deleted — downgrade to free
    // ------------------------------------------------------------------
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const subscriptionId = subscription.id;

      const { error } = await supabase
        .from("tenants")
        .update({
          plan: "free",
          stripe_subscription_id: null,
          stripe_price_id: null,
        })
        .eq("stripe_subscription_id", subscriptionId);

      if (error) {
        console.error(
          "[stripe] Failed to downgrade tenant after subscription deletion:",
          error,
        );
        return { received: true, event: type, error: "DB update failed" };
      }

      console.log(
        `[stripe] Subscription ${subscriptionId} deleted → tenant downgraded to free`,
      );
      return { received: true, event: type };
    }

    default:
      return { received: true, event: type };
  }
}
