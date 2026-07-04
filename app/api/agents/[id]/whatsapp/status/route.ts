// ---------------------------------------------------------------------------
// TrustVault P16 — GET /api/agents/[id]/whatsapp/status
// ---------------------------------------------------------------------------
// Returns the WhatsApp connection status by querying agent_channels.
// No Puppeteer/QR polling — the source of truth is the database row.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/client";
import type { WhatsAppStatusResponse, ErrorResponse } from "@/lib/types";
import { decryptChannelConfig, type WhatsAppPlainConfig } from "@/lib/agent-channel";
import { isValidUUID } from '@/lib/utils';

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
  if (!isValidUUID(agentId)) {
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

  // -- 4. Query agent_channels for WhatsApp config --------------------------
  const supabaseService = createServiceClient();

  const { data: channelRow } = await supabaseService
    .from("agent_channels")
    .select("id, is_active, config")
    .eq("agent_id", agentId)
    .eq("channel_type", "whatsapp")
    .maybeSingle();

  if (!channelRow) {
    // No WhatsApp channel exists for this agent
    return NextResponse.json({
      status: "disconnected",
      phoneNumberId: null,
    });
  }

  const ch = channelRow as Record<string, unknown>;
  const isActive = ch.is_active as boolean;

  if (!isActive) {
    return NextResponse.json({
      status: "disconnected",
      phoneNumberId: null,
    });
  }

  // Decrypt config to get the phoneNumberId
  let phoneNumberId: string | null = null;
  try {
    const plain = decryptChannelConfig<WhatsAppPlainConfig>(ch.config as Record<string, unknown>);
    phoneNumberId = plain.phoneNumberId ?? null;
  } catch {
    // Config decryption failed — treat as disconnected
    return NextResponse.json({
      status: "disconnected",
      phoneNumberId: null,
    });
  }

  return NextResponse.json({
    status: "connected",
    phoneNumberId,
  });
}
