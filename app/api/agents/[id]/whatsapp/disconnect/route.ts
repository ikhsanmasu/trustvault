// ---------------------------------------------------------------------------
// TrustVault P16 — POST /api/agents/[id]/whatsapp/disconnect
// ---------------------------------------------------------------------------
// Disconnects a WhatsApp channel by setting is_active = false on the
// agent_channels row. No Puppeteer/QR teardown needed.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/client";
import type {
  WhatsAppDisconnectResponse,
  ErrorResponse,
} from "@/lib/types";
import { markWhatsAppDisconnected } from "@/lib/agent-channel";
import { isValidUUID } from '@/lib/utils';

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
  if (!isValidUUID(agentId)) {
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

  // -- 5. Update agent_channels to set is_active = false --------------------
  const supabaseService = createServiceClient();

  const { error: updateErr } = await supabaseService
    .from("agent_channels")
    .update({ is_active: false })
    .eq("agent_id", agentId)
    .eq("channel_type", "whatsapp");

  if (updateErr) {
    console.error("[whatsapp:disconnect] Failed to update channel:", updateErr);
    return NextResponse.json(
      { error: "Failed to disconnect WhatsApp channel", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // -- 6. Mark disconnected in-memory ---------------------------------------
  markWhatsAppDisconnected(agentId);

  // -- 7. Return success ----------------------------------------------------
  return NextResponse.json({ status: "disconnected" });
}
