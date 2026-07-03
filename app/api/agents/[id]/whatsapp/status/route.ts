// ---------------------------------------------------------------------------
// TrustVault P16 — GET /api/agents/[id]/whatsapp/status
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import type { WhatsAppStatusResponse, ErrorResponse } from "@/lib/types";
import { getWhatsAppStatus } from "@/lib/agent-channel";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<WhatsAppStatusResponse | ErrorResponse>> {
  const { id: agentId } = await params;

  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  // -- 2. Validate agentId --------------------------------------------------
  if (!UUID_RE.test(agentId)) {
    return NextResponse.json(
      { error: "Invalid agent ID", code: "INVALID_AGENT_ID" },
      { status: 400 },
    );
  }

  // -- 3. Verify agent exists -----------------------------------------------
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

  // -- 4. Fetch WhatsApp channel --------------------------------------------
  const { data: channelRow } = await supabase
    .from("agent_channels")
    .select("id")
    .eq("agent_id", agentId)
    .eq("channel_type", "whatsapp")
    .single();

  if (!channelRow) {
    return NextResponse.json(
      { error: "No WhatsApp channel found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 5. Return in-memory status -------------------------------------------
  const status = getWhatsAppStatus(agentId);
  const ch = channelRow as Record<string, unknown>;

  return NextResponse.json({
    channel_id: ch.id as string,
    status: status.status,
    qr_code: status.qrCode,
    phone_number: status.phoneNumber,
  });
}
