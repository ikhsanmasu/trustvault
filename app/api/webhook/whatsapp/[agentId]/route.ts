// ---------------------------------------------------------------------------
// TrustVault P16 — Meta Cloud API Webhook Handler
// POST /api/webhook/whatsapp/[agentId]
// GET  /api/webhook/whatsapp/[agentId]  (Meta webhook verification)
// ---------------------------------------------------------------------------
// Handles incoming WhatsApp messages from the Meta Cloud API webhook.
//
// GET  — Meta's webhook verification challenge.
//        Compares hub.verify_token with the stored accessToken.
//        Returns 200 with hub.challenge if valid.
//
// POST — Receives message notifications from Meta. Verifies HMAC-SHA256
//        signature, extracts text and sender, runs agent RAG pipeline.
// ---------------------------------------------------------------------------

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { WebhookResponse, ErrorResponse } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/client";
import { checkWebhookRateLimit } from "@/lib/rate-limit";
import {
  decryptChannelConfig,
  sendWhatsAppMessage,
  handleAgentMessage,
  findOrCreateChannelSession,
  type WhatsAppPlainConfig,
} from "@/lib/agent-channel";
import { isValidUUID } from '@/lib/utils';

// ---------------------------------------------------------------------------
// GET — Meta webhook verification
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<NextResponse> {
  const { agentId } = await params;

  // Validate agentId
  if (!isValidUUID(agentId)) {
    return new NextResponse("Invalid agent ID", { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  // Meta only sends "subscribe" mode for webhook verification
  if (mode !== "subscribe" || !verifyToken || !challenge) {
    return new NextResponse("Bad request", { status: 400 });
  }

  // Look up the agent's WhatsApp channel and compare verify_token
  const supabaseService = createServiceClient();

  const { data: channelRow } = await supabaseService
    .from("agent_channels")
    .select("config")
    .eq("agent_id", agentId)
    .eq("channel_type", "whatsapp")
    .eq("is_active", true)
    .maybeSingle();

  if (!channelRow) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Decrypt config and compare verify_token (we use accessToken as the verify token)
  let plain: WhatsAppPlainConfig;
  try {
    plain = decryptChannelConfig<WhatsAppPlainConfig>(
      (channelRow as Record<string, unknown>).config as Record<string, unknown>,
    );
  } catch {
    return new NextResponse("Configuration error", { status: 500 });
  }

  if (plain.accessToken !== verifyToken) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Return the challenge value as plain text (Meta requires this)
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// ---------------------------------------------------------------------------
// POST — Incoming WhatsApp messages
// ---------------------------------------------------------------------------

/**
 * Shape of a Meta webhook message entry value.
 */
interface WebhookMessageValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: Array<{
    from?: string;
    id?: string;
    timestamp?: string;
    text?: { body?: string };
    type?: string;
  }>;
}

interface WebhookEntry {
  id?: string;
  changes?: Array<{
    value?: WebhookMessageValue;
    field?: string;
  }>;
}

interface MetaWebhookBody {
  object?: string;
  entry?: WebhookEntry[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<NextResponse<WebhookResponse | ErrorResponse>> {
  const { agentId } = await params;

  // -- 1. Validate agentId --------------------------------------------------
  if (!isValidUUID(agentId)) {
    return NextResponse.json(
      { error: "Invalid agent ID", code: "INVALID_AGENT_ID" },
      { status: 400 },
    );
  }

  // -- 2. Rate limit check --------------------------------------------------
  const rateLimit = checkWebhookRateLimit(agentId, 30, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED" },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rateLimit.resetAt),
          "Retry-After": String(rateLimit.resetAt - Math.ceil(Date.now() / 1000)),
        },
      },
    );
  }

  // -- 3. Verify HMAC signature (Meta Cloud API) ----------------------------
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const rawBody = await request.clone().text();
    const signature = request.headers.get("X-Hub-Signature-256");
    const expectedSignature = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;

    if (!signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return NextResponse.json(
        { error: "Invalid signature", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[webhook:whatsapp] WHATSAPP_APP_SECRET not set — refusing webhook in production");
    return NextResponse.json(
      { error: "Webhook not configured", code: "CONFIG_ERROR" },
      { status: 500 },
    );
  }

  // -- 4. Parse webhook body ------------------------------------------------
  let body: MetaWebhookBody;
  try {
    body = (await request.json()) as MetaWebhookBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_BODY" },
      { status: 400 },
    );
  }

  // -- 3. Verify agent exists and fetch channel config ----------------------
  const supabaseService = createServiceClient();

  const { data: channelRow } = await supabaseService
    .from("agent_channels")
    .select("config")
    .eq("agent_id", agentId)
    .eq("channel_type", "whatsapp")
    .eq("is_active", true)
    .maybeSingle();

  if (!channelRow) {
    return NextResponse.json(
      { error: "No active WhatsApp channel found for this agent", code: "CHANNEL_NOT_FOUND" },
      { status: 404 },
    );
  }

  // Decrypt config to get phoneNumberId and accessToken
  let plain: WhatsAppPlainConfig;
  try {
    plain = decryptChannelConfig<WhatsAppPlainConfig>(
      (channelRow as Record<string, unknown>).config as Record<string, unknown>,
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt channel configuration", code: "CONFIG_ERROR" },
      { status: 500 },
    );
  }

  if (!plain.phoneNumberId || !plain.accessToken) {
    return NextResponse.json(
      { error: "Channel configuration is incomplete", code: "CONFIG_ERROR" },
      { status: 500 },
    );
  }

  // -- 4. Process each incoming message -------------------------------------
  const entries = body.entry ?? [];

  for (const entry of entries) {
    const changes = entry.changes ?? [];
    for (const change of changes) {
      const value = change.value;
      if (!value) continue;

      // Only process "messages" field (ignore "status" updates etc.)
      if (change.field !== "messages") continue;

      const messages = value.messages ?? [];
      for (const msg of messages) {
        // Only handle text messages
        if (msg.type !== "text" || !msg.text?.body) continue;
        const from = msg.from;
        const messageText = msg.text.body;

        if (!from) continue;

        try {
          // Find or create a session for this external user
          const sessionId = await findOrCreateChannelSession(
            agentId,
            from,
            messageText,
          );

          // Run the agent's RAG pipeline
          const result = await handleAgentMessage(
            agentId,
            sessionId,
            messageText,
            "whatsapp",
            from,
          );

          // Send the reply via Meta Cloud API
          const sendResult = await sendWhatsAppMessage(
            plain.phoneNumberId,
            plain.accessToken,
            from,
            result.response,
          );

          if (!sendResult.success) {
            console.error(
              `[webhook:whatsapp] Failed to send reply to ${from}: ${sendResult.error}`,
            );
          }
        } catch (err) {
          console.error(
            `[webhook:whatsapp] Error processing message from ${from}:`,
            err instanceof Error ? err.message : err,
          );
          // Continue processing other messages even if one fails
        }
      }
    }
  }

  // Always return 200 OK to acknowledge receipt (Meta retries on non-2xx)
  return NextResponse.json({ ok: true });
}
