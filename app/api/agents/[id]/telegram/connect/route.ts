// ---------------------------------------------------------------------------
// TrustVault P16 — POST /api/agents/[id]/telegram/connect
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import type {
  TelegramConnectRequest,
  TelegramConnectResponse,
  ErrorResponse,
} from "@/lib/types";
import {
  setTelegramConnected,
  encryptChannelConfig,
} from "@/lib/agent-channel";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BOT_TOKEN_RE = /^\d+:[\w-]+$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<TelegramConnectResponse | ErrorResponse>> {
  const { id: agentId } = await params;

  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Validate agentId --------------------------------------------------
  if (!UUID_RE.test(agentId)) {
    return NextResponse.json(
      { error: "Invalid agent ID", code: "INVALID_AGENT_ID" },
      { status: 400 },
    );
  }

  // -- 3. Fetch agent -------------------------------------------------------
  const { data: agentRow } = await supabase
    .from("agents")
    .select("id, tenant_id, is_active")
    .eq("id", agentId)
    .single();

  if (!agentRow) {
    return NextResponse.json(
      { error: "Agent not found", code: "AGENT_NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 4. Check role (editor+) ----------------------------------------------
  const roleCheck = await requireTenantRole(supabase, user.id, [
    "owner", "admin", "editor",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // -- 5. Parse body --------------------------------------------------------
  let body: TelegramConnectRequest;
  try {
    body = (await request.json()) as TelegramConnectRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_BOT_TOKEN" },
      { status: 400 },
    );
  }

  // -- 6. Validate bot_token ------------------------------------------------
  if (
    !body.bot_token ||
    typeof body.bot_token !== "string" ||
    body.bot_token.trim().length === 0
  ) {
    return NextResponse.json(
      {
        error: "bot_token is required and must not be empty",
        code: "INVALID_BOT_TOKEN",
      },
      { status: 400 },
    );
  }

  if (!BOT_TOKEN_RE.test(body.bot_token.trim())) {
    return NextResponse.json(
      {
        error: "bot_token format is invalid. Expected format: digits:alphanumeric (e.g., 1234567890:ABCdefGHIjkl)",
        code: "INVALID_BOT_TOKEN",
      },
      { status: 400 },
    );
  }

  // -- 7. Fetch Telegram channel --------------------------------------------
  const { data: channelRow } = await supabase
    .from("agent_channels")
    .select("*")
    .eq("agent_id", agentId)
    .eq("channel_type", "telegram")
    .single();

  if (!channelRow) {
    return NextResponse.json(
      {
        error: "No Telegram channel configured for this agent. Create one via POST /api/agents/[id]/channels first.",
        code: "NO_TELEGRAM_CHANNEL",
      },
      { status: 400 },
    );
  }

  const ch = channelRow as Record<string, unknown>;
  const botToken = body.bot_token.trim();

  // -- 8. Validate bot token with Telegram getMe API ------------------------
  let botUsername: string;

  try {
    const getMeResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getMe`,
    );
    const getMeData = (await getMeResponse.json()) as {
      ok: boolean;
      result?: { username?: string; first_name?: string };
      description?: string;
    };

    if (!getMeData.ok || !getMeData.result?.username) {
      return NextResponse.json(
        {
          error: getMeData.description ?? "Invalid bot token — Telegram rejected the token",
          code: "INVALID_BOT_TOKEN",
        },
        { status: 400 },
      );
    }

    botUsername = getMeData.result.username;
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to validate bot token: ${err instanceof Error ? err.message : "Unknown error"}`,
        code: "INVALID_BOT_TOKEN",
      },
      { status: 400 },
    );
  }

  // -- 9. Register webhook --------------------------------------------------
  const appUrl =
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const webhookUrl = appUrl
    ? `${appUrl.replace(/\/$/, "")}/api/webhook/telegram/${agentId}`
    : "";

  if (webhookUrl) {
    try {
      const webhookResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: webhookUrl,
            ...(process.env.TELEGRAM_WEBHOOK_SECRET
              ? {
                  secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
                }
              : {}),
          }),
        },
      );
      const webhookData = (await webhookResponse.json()) as {
        ok: boolean;
        description?: string;
      };

      if (!webhookData.ok) {
        console.warn(
          `[telegram:connect] Webhook registration warning: ${webhookData.description}`,
        );
        // Don't fail — the bot token is valid and we can retry later
      }
    } catch (err) {
      console.warn(
        `[telegram:connect] Webhook registration error: ${err instanceof Error ? err.message : err}`,
      );
      // Don't fail — webhook registration may fail in dev without a public URL
    }
  }

  // -- 10. Encrypt and store config -----------------------------------------
  const plainConfig = {
    bot_token: botToken,
    bot_username: botUsername,
    webhook_url: webhookUrl,
  };

  const encryptedConfig = encryptChannelConfig(plainConfig);

  const { error: updateError } = await supabase
    .from("agent_channels")
    .update({
      config: encryptedConfig,
      is_active: true,
    })
    .eq("id", ch.id as string);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update channel config", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // -- 11. Register in-memory -----------------------------------------------
  setTelegramConnected(agentId, botUsername, botToken);

  return NextResponse.json({
    channel_id: ch.id as string,
    bot_username: botUsername,
    webhook_url: webhookUrl,
  });
}
