// ---------------------------------------------------------------------------
// TrustVault P16 — POST /api/agents/[id]/channels (add channel)
//                   GET  /api/agents/[id]/channels (list channels)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import type {
  AddChannelRequest,
  AddChannelResponse,
  AgentChannel,
  ErrorResponse,
} from "@/lib/types";
import { encryptChannelConfig, redactChannelConfig } from "@/lib/agent-channel";
import { isValidUUID } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CHANNEL_TYPES = ["whatsapp", "telegram"] as const;

// ---------------------------------------------------------------------------
// POST /api/agents/[id]/channels
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<AddChannelResponse | ErrorResponse>> {
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
  const { data: agentRow, error: agentError } = await supabase
    .from("agents")
    .select("id, tenant_id")
    .eq("id", agentId)
    .single();

  if (agentError || !agentRow) {
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

  // -- 5. Parse body --------------------------------------------------------
  let body: AddChannelRequest;
  try {
    body = (await request.json()) as AddChannelRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_CHANNEL_TYPE" },
      { status: 400 },
    );
  }

  // -- 6. Validate channel_type ---------------------------------------------
  if (
    !body.channel_type ||
    !VALID_CHANNEL_TYPES.includes(body.channel_type as typeof VALID_CHANNEL_TYPES[number])
  ) {
    return NextResponse.json(
      {
        error: `channel_type must be one of: ${VALID_CHANNEL_TYPES.join(", ")}`,
        code: "INVALID_CHANNEL_TYPE",
      },
      { status: 400 },
    );
  }

  // -- 7. Validate config ---------------------------------------------------
  if (!body.config || typeof body.config !== "object") {
    return NextResponse.json(
      {
        error: "config is required and must be an object",
        code: "INVALID_CONFIG",
      },
      { status: 400 },
    );
  }

  if (body.channel_type === "whatsapp") {
    if (!body.config.phone_number || typeof body.config.phone_number !== "string") {
      return NextResponse.json(
        {
          error: "config.phone_number is required for WhatsApp channels",
          code: "INVALID_CONFIG",
        },
        { status: 400 },
      );
    }
  } else if (body.channel_type === "telegram") {
    if (!body.config.bot_token || typeof body.config.bot_token !== "string") {
      return NextResponse.json(
        {
          error: "config.bot_token is required for Telegram channels",
          code: "INVALID_CONFIG",
        },
        { status: 400 },
      );
    }
  }

  // -- 8. Remove existing channel of same type ------------------------------
  const { data: existingChannels } = await supabase
    .from("agent_channels")
    .select("id")
    .eq("agent_id", agentId)
    .eq("channel_type", body.channel_type);

  if (existingChannels && existingChannels.length > 0) {
    await supabase
      .from("agent_channels")
      .delete()
      .eq("agent_id", agentId)
      .eq("channel_type", body.channel_type);
  }

  // -- 9. Encrypt and insert channel ----------------------------------------
  const encryptedConfig = encryptChannelConfig(body.config);

  const { data: channelRow, error: insertError } = await supabase
    .from("agent_channels")
    .insert({
      agent_id: agentId,
      channel_type: body.channel_type,
      config: encryptedConfig,
      is_active: false,
    })
    .select("*")
    .single();

  if (insertError || !channelRow) {
    return NextResponse.json(
      { error: "Failed to create channel", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const c = channelRow as Record<string, unknown>;
  const channel: AgentChannel = {
    id: c.id as string,
    agent_id: c.agent_id as string,
    channel_type: c.channel_type as "whatsapp" | "telegram",
    config: redactChannelConfig(
      c.channel_type as string,
      c.config as Record<string, unknown> | null,
    ),
    is_active: c.is_active as boolean,
    created_at: c.created_at as string,
  };

  return NextResponse.json({ channel }, { status: 201 });
}

// ---------------------------------------------------------------------------
// GET /api/agents/[id]/channels
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ channels: AgentChannel[] } | ErrorResponse>> {
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

  // -- 3. Verify agent exists in tenant -------------------------------------
  const { data: agentRow, error: agentError } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .single();

  if (agentError || !agentRow) {
    return NextResponse.json(
      { error: "Agent not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 4. Fetch channels ----------------------------------------------------
  const { data: channelRows } = await supabase
    .from("agent_channels")
    .select("*")
    .eq("agent_id", agentId);

  const channels: AgentChannel[] = (
    (channelRows ?? []) as Array<Record<string, unknown>>
  ).map((c) => ({
    id: c.id as string,
    agent_id: c.agent_id as string,
    channel_type: c.channel_type as "whatsapp" | "telegram",
    config: redactChannelConfig(
      c.channel_type as string,
      c.config as Record<string, unknown> | null,
    ),
    is_active: c.is_active as boolean,
    created_at: c.created_at as string,
  }));

  return NextResponse.json({ channels });
}
