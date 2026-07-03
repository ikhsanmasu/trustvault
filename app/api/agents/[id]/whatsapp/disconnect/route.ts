// ---------------------------------------------------------------------------
// TrustVault P16 — POST /api/agents/[id]/whatsapp/disconnect
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import type { WhatsAppDisconnectResponse, ErrorResponse } from "@/lib/types";
import { destroyWhatsAppClient } from "@/lib/agent-channel";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<WhatsAppDisconnectResponse | ErrorResponse>> {
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
    .select("id")
    .eq("id", agentId)
    .single();

  if (!agentRow) {
    return NextResponse.json(
      { error: "Agent not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 4. Check role (editor+) ----------------------------------------------
  const roleCheck = await requireTenantRole(supabase, user.id, [
    "owner", "admin", "editor",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // -- 5. Fetch WhatsApp channel --------------------------------------------
  const { data: channelRow } = await supabase
    .from("agent_channels")
    .select("*")
    .eq("agent_id", agentId)
    .eq("channel_type", "whatsapp")
    .single();

  if (!channelRow) {
    return NextResponse.json(
      { error: "No WhatsApp channel found for this agent", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const ch = channelRow as Record<string, unknown>;

  // -- 6. Destroy WhatsApp client -------------------------------------------
  try {
    destroyWhatsAppClient(agentId);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to disconnect WhatsApp: ${err instanceof Error ? err.message : "Unknown error"}`,
        code: "DISCONNECT_ERROR",
      },
      { status: 500 },
    );
  }

  // -- 7. Update DB ----------------------------------------------------------
  await supabase
    .from("agent_channels")
    .update({ is_active: false })
    .eq("id", ch.id as string);

  return NextResponse.json({ disconnected: true });
}
