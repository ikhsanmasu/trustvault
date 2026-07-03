// ---------------------------------------------------------------------------
// TrustVault P16 — POST /api/webhook/whatsapp/[agentId]
// ---------------------------------------------------------------------------
// Placeholder for future WhatsApp Business API integration.
// With the unofficial whatsapp-web.js library used in P16, incoming WhatsApp
// messages are handled internally via the client's 'message' event, not
// through webhooks.
//
// This endpoint is defined for forward compatibility with the official
// WhatsApp Business API which uses webhook-based message delivery.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import type { WebhookResponse, ErrorResponse } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<NextResponse<WebhookResponse | ErrorResponse>> {
  const { agentId } = await params;

  // -- 1. Validate agentId --------------------------------------------------
  if (!UUID_RE.test(agentId)) {
    return NextResponse.json(
      { error: "Invalid agent ID", code: "INVALID_AGENT_ID" },
      { status: 400 },
    );
  }

  // -- 2. Verify webhook secret (future WhatsApp Business API) --------------
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (webhookSecret) {
    const header = request.headers.get("X-Webhook-Secret");
    if (header !== webhookSecret) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
  }

  // -- 3. Verify agent exists and is active ---------------------------------
  const supabaseService = createServiceClient();

  const { data: agentRow } = await supabaseService
    .from("agents")
    .select("id, is_active")
    .eq("id", agentId)
    .single();

  if (!agentRow) {
    return NextResponse.json(
      { error: "Agent not found", code: "AGENT_NOT_FOUND" },
      { status: 404 },
    );
  }

  const ar = agentRow as Record<string, unknown>;
  if (!ar.is_active) {
    return NextResponse.json(
      { error: "Agent is not active", code: "AGENT_NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 4. Placeholder: process message --------------------------------------
  // Future implementation: parse WhatsApp Business API message format,
  // extract text and sender, run through agent's RAG pipeline, send reply.

  return NextResponse.json({ ok: true });
}
