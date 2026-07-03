// ---------------------------------------------------------------------------
// TrustVault P16 — DELETE /api/agents/[id]/channels/[channelId]
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import type { DeleteChannelResponse, ErrorResponse } from "@/lib/types";
import {
  markWhatsAppDisconnected,
  setTelegramDisconnected,
  decryptChannelConfig,
} from "@/lib/agent-channel";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; channelId: string }> },
): Promise<NextResponse<DeleteChannelResponse | ErrorResponse>> {
  const { id: agentId, channelId } = await params;

  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Validate UUIDs ----------------------------------------------------
  if (!UUID_RE.test(agentId)) {
    return NextResponse.json(
      { error: "Invalid agent ID", code: "INVALID_AGENT_ID" },
      { status: 400 },
    );
  }
  if (!UUID_RE.test(channelId)) {
    return NextResponse.json(
      { error: "Invalid channel ID", code: "INVALID_CHANNEL_ID" },
      { status: 400 },
    );
  }

  // -- 3. Verify agent exists -----------------------------------------------
  const { data: agentRow } = await supabase
    .from("agents")
    .select("id, tenant_id")
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

  // -- 5. Fetch channel -----------------------------------------------------
  const { data: channelRow, error: channelError } = await supabase
    .from("agent_channels")
    .select("*")
    .eq("id", channelId)
    .eq("agent_id", agentId)
    .single();

  if (channelError || !channelRow) {
    return NextResponse.json(
      { error: "Channel not found", code: "CHANNEL_NOT_FOUND" },
      { status: 404 },
    );
  }

  const ch = channelRow as Record<string, unknown>;
  const channelType = ch.channel_type as string;

  // -- 6. Disconnect active channel -----------------------------------------
  if (ch.is_active) {
    try {
      if (channelType === "whatsapp") {
        markWhatsAppDisconnected(agentId);
      } else if (channelType === "telegram") {
        // Attempt to delete webhook
        try {
          const config = decryptChannelConfig<{ bot_token?: string }>(
            ch.config as Record<string, unknown> | null,
          );
          if (config.bot_token) {
            await fetch(
              `https://api.telegram.org/bot${config.bot_token}/deleteWebhook`,
              { method: "POST" },
            );
          }
        } catch {
          // Best-effort webhook deletion
        }
        setTelegramDisconnected(agentId);
      }
    } catch (err) {
      return NextResponse.json(
        {
          error: `Failed to disconnect channel: ${err instanceof Error ? err.message : "Unknown error"}`,
          code: "CHANNEL_DISCONNECT_ERROR",
        },
        { status: 500 },
      );
    }
  }

  // -- 7. Delete channel ----------------------------------------------------
  const { error: deleteError } = await supabase
    .from("agent_channels")
    .delete()
    .eq("id", channelId);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete channel", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: true });
}
