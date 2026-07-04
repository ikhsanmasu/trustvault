// ---------------------------------------------------------------------------
// TrustVault P16 — POST /api/agents/[id]/whatsapp/connect
// ---------------------------------------------------------------------------
// Connects a WhatsApp channel via the official Meta Cloud API.
// Accepts phoneNumberId and accessToken, encrypts and stores the config,
// and marks the channel as active.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/client";
import type {
  WhatsAppConnectRequest,
  WhatsAppConnectResponse,
  ErrorResponse,
} from "@/lib/types";
import {
  encryptChannelConfig,
  markWhatsAppConnected,
} from "@/lib/agent-channel";
import { isValidUUID } from '@/lib/utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<WhatsAppConnectResponse | ErrorResponse>> {
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

  // -- 3. Parse request body ------------------------------------------------
  let body: WhatsAppConnectRequest;
  try {
    body = (await request.json()) as WhatsAppConnectRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_BODY" },
      { status: 400 },
    );
  }

  const { phoneNumberId, accessToken } = body;

  if (!phoneNumberId || typeof phoneNumberId !== "string" || phoneNumberId.trim().length === 0) {
    return NextResponse.json(
      { error: "phoneNumberId is required", code: "MISSING_PHONE_NUMBER_ID" },
      { status: 400 },
    );
  }

  if (!accessToken || typeof accessToken !== "string" || accessToken.trim().length === 0) {
    return NextResponse.json(
      { error: "accessToken is required", code: "MISSING_ACCESS_TOKEN" },
      { status: 400 },
    );
  }

  // -- 4. Fetch agent -------------------------------------------------------
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

  // -- 5. Check role (editor+) ----------------------------------------------
  const roleCheck = await requireTenantRole(supabase, user.id, [
    "owner", "admin", "editor",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // -- 6. Encrypt config ----------------------------------------------------
  const plainConfig = {
    phoneNumberId: phoneNumberId.trim(),
    accessToken: accessToken.trim(),
  };
  const encryptedConfig = encryptChannelConfig(plainConfig);

  // -- 7. Upsert agent_channels row via service client ----------------------
  const supabaseService = createServiceClient();

  // Check for existing WhatsApp channel
  const { data: existingChannel } = await supabaseService
    .from("agent_channels")
    .select("id")
    .eq("agent_id", agentId)
    .eq("channel_type", "whatsapp")
    .maybeSingle();

  if (existingChannel) {
    // Update existing channel
    const { error: updateErr } = await supabaseService
      .from("agent_channels")
      .update({
        config: encryptedConfig,
        is_active: true,
      })
      .eq("id", existingChannel.id as string);

    if (updateErr) {
      console.error("[whatsapp:connect] Failed to update channel:", updateErr);
      return NextResponse.json(
        { error: "Failed to store WhatsApp configuration", code: "DB_ERROR" },
        { status: 500 },
      );
    }
  } else {
    // Insert new channel row
    const { error: insertErr } = await supabaseService
      .from("agent_channels")
      .insert({
        agent_id: agentId,
        channel_type: "whatsapp",
        config: encryptedConfig,
        is_active: true,
      });

    if (insertErr) {
      console.error("[whatsapp:connect] Failed to insert channel:", insertErr);
      return NextResponse.json(
        { error: "Failed to store WhatsApp configuration", code: "DB_ERROR" },
        { status: 500 },
      );
    }
  }

  // -- 8. Mark connected in-memory ------------------------------------------
  markWhatsAppConnected(agentId, phoneNumberId.trim());

  // -- 9. Return success ----------------------------------------------------
  return NextResponse.json({
    status: "connected",
    phoneNumberId: phoneNumberId.trim(),
  });
}
