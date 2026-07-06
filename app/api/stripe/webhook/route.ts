// ---------------------------------------------------------------------------
// TrustVault P23 — POST /api/stripe/webhook
// Receives Stripe webhook events. No session auth — uses Stripe signature
// verification. DB writes use the service-role client (no RLS context).
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, processStripeEvent } from "@/lib/stripe";
import { safeError } from "@/lib/utils";

/**
 * Stripe webhooks require the raw body for signature verification.
 * Next.js by default parses the body, so we disable body parsing for this route.
 */
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
): Promise<NextResponse<{ received: boolean; error?: string }>> {
  const stripe = getStripe();

  // -- 1. verify Stripe is configured ---------------------------------------
  if (!stripe) {
    console.error("[stripe:webhook] Stripe is not configured");
    return NextResponse.json(
      { received: false, error: "Stripe not configured" },
      { status: 500 },
    );
  }

  // -- 2. get the raw body + signature header -------------------------------
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { received: false, error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe:webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { received: false, error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  // -- 3. read raw body (Next.js App Router buffers it by default) ----------
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { received: false, error: "Failed to read request body" },
      { status: 400 },
    );
  }

  // -- 4. verify signature + construct event --------------------------------
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    console.error("[stripe:webhook] Signature verification failed:", err);
    return NextResponse.json(
      {
        received: false,
        error: `Signature verification failed: ${safeError("invalid signature", err)}`,
      },
      { status: 400 },
    );
  }

  // -- 5. process the event -------------------------------------------------
  try {
    const result = await processStripeEvent(event);
    console.log(`[stripe:webhook] Processed event: ${event.type}`);
    return NextResponse.json(result, { status: result.error ? 500 : 200 });
  } catch (err) {
    console.error(`[stripe:webhook] Error processing ${event.type}:`, err);
    return NextResponse.json(
      {
        received: true,
        error: safeError("Failed to process webhook event", err),
      },
      { status: 500 },
    );
  }
}
