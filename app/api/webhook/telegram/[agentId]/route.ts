// ---------------------------------------------------------------------------
// TrustVault P16 — POST /api/webhook/telegram/[agentId]
// ---------------------------------------------------------------------------
// Receives incoming Telegram messages via webhook. Called by Telegram's
// servers when a user sends a message to the connected bot.
//
// This endpoint does NOT require a Supabase session — it is called by
// Telegram's servers, not by a browser user. It uses the service-role
// client for DB access.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import type { WebhookResponse, ErrorResponse } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/client";
import { checkWebhookRateLimit } from "@/lib/rate-limit";
import { safeError } from "@/lib/utils";
import {
  decryptChannelConfig,
  handleAgentMessage,
  findOrCreateChannelSession,
  getTelegramBotToken,
} from "@/lib/agent-channel";
import { isValidUUID } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helper types for Telegram updates
// ---------------------------------------------------------------------------

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

// ---------------------------------------------------------------------------
// POST /api/webhook/telegram/[agentId]
// ---------------------------------------------------------------------------

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

  // -- 3. Verify Telegram webhook secret ------------------------------------
  // REQUIRED in production. In dev, can be skipped for local testing.
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[webhook:telegram] TELEGRAM_WEBHOOK_SECRET is not set — refusing webhook in production");
      return NextResponse.json(
        { error: "Webhook not configured", code: "CONFIG_ERROR" },
        { status: 500 },
      );
    }
    console.warn("[webhook:telegram] TELEGRAM_WEBHOOK_SECRET not set — webhook verification skipped (dev only)");
  } else {
    const header = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (header !== webhookSecret) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
  }

  // -- 3. Parse update body -------------------------------------------------
  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  // -- 4. Extract message ---------------------------------------------------
  const message = update.message ?? update.edited_message;
  if (!message || !message.text) {
    // Not a text message — acknowledge silently
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id;
  const userId = message.from?.id;
  const userName =
    message.from?.first_name ?? message.from?.username ?? "Unknown";
  const text = message.text;

  if (!text || text.trim().length === 0) {
    return NextResponse.json({ ok: true });
  }

  // -- 5. Verify agent exists and is active ---------------------------------
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

  // -- 6. Verify Telegram channel is active ---------------------------------
  const { data: channelRow } = await supabaseService
    .from("agent_channels")
    .select("*")
    .eq("agent_id", agentId)
    .eq("channel_type", "telegram")
    .eq("is_active", true)
    .single();

  if (!channelRow) {
    return NextResponse.json(
      { error: "No active Telegram channel for this agent", code: "CHANNEL_NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 7. Decrypt bot token -------------------------------------------------
  const ch = channelRow as Record<string, unknown>;
  let botToken: string | undefined;

  try {
    // Try in-memory first (faster)
    botToken = getTelegramBotToken(agentId);
    if (!botToken) {
      const config = decryptChannelConfig<{ bot_token?: string }>(
        ch.config as Record<string, unknown> | null,
      );
      botToken = config.bot_token;
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt channel config", code: "PROCESSING_ERROR" },
      { status: 500 },
    );
  }

  if (!botToken) {
    return NextResponse.json(
      { error: "Bot token not found in channel config", code: "PROCESSING_ERROR" },
      { status: 500 },
    );
  }

  // -- 8. Find or create session --------------------------------------------
  const externalUserId = `telegram:${chatId}`;
  let sessionId: string;

  try {
    sessionId = await findOrCreateChannelSession(
      agentId,
      externalUserId,
      `Telegram: ${userName}`,
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: safeError("Failed to create session", err),
        code: "PROCESSING_ERROR",
      },
      { status: 500 },
    );
  }

  // -- 9. Process message through agent pipeline ----------------------------
  try {
    const result = await handleAgentMessage(
      agentId,
      sessionId,
      text,
      "telegram",
      String(chatId),
    );

    // -- 10. Send reply via Telegram ----------------------------------------
    const replyText =
      result.response.length > 4000
        ? result.response.slice(0, 3997) + "..."
        : result.response;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: replyText,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error(
      `[webhook:telegram] Failed to process message for agent ${agentId}:`,
      err,
    );

    // Attempt to send an error reply
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Sorry, I encountered an error while processing your message. Please try again later.",
        }),
      });
    } catch {
      // Best-effort error reply
    }

    return NextResponse.json(
      {
        error: safeError("Message processing failed", err),
        code: "PROCESSING_ERROR",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
