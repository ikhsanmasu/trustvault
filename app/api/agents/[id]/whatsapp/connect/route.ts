// ---------------------------------------------------------------------------
// TrustVault P16 — POST /api/agents/[id]/whatsapp/connect
// ---------------------------------------------------------------------------
// Initialises the WhatsApp Web connection: starts the whatsapp-web.js client,
// captures the QR code, and enables status polling via GET .../whatsapp/status.
//
// NOTE: whatsapp-web.js requires a running Puppeteer/Chromium instance.
// In production on Vercel, the WhatsApp client must run as a separate service.
// This implementation handles the in-process case for local development and
// includes a graceful degradation path for environments without Puppeteer.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import type {
  WhatsAppConnectResponse,
  ErrorResponse,
} from "@/lib/types";
import {
  getWhatsAppStatus,
  setWhatsAppQRCode,
  setWhatsAppConnecting,
  setWhatsAppConnected,
  setWhatsAppDisconnected,
} from "@/lib/agent-channel";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<WhatsAppConnectResponse | ErrorResponse>> {
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

  // -- 5. Fetch WhatsApp channel --------------------------------------------
  const { data: channelRow } = await supabase
    .from("agent_channels")
    .select("*")
    .eq("agent_id", agentId)
    .eq("channel_type", "whatsapp")
    .single();

  if (!channelRow) {
    return NextResponse.json(
      {
        error: "No WhatsApp channel configured for this agent. Create one via POST /api/agents/[id]/channels first.",
        code: "NO_WHATSAPP_CHANNEL",
      },
      { status: 400 },
    );
  }

  const ch = channelRow as Record<string, unknown>;

  // -- 6. Check if already connected ----------------------------------------
  const currentStatus = getWhatsAppStatus(agentId);
  if (currentStatus.status === "connected" || currentStatus.status === "connecting") {
    return NextResponse.json(
      {
        error: "WhatsApp is already connected or connecting for this agent",
        code: "ALREADY_CONNECTED",
      },
      { status: 409 },
    );
  }

  // -- 7. Initialise WhatsApp client ----------------------------------------
  // whatsapp-web.js requires Puppeteer. This is best-effort — in environments
  // without Puppeteer (e.g., Vercel serverless), the connect flow will fail
  // gracefully and the frontend should display a message suggesting the
  // user run the WhatsApp service separately.

  let clientStarted = false;

  try {
    // Dynamic import — fails gracefully if whatsapp-web.js or Puppeteer
    // is not available in the current environment.
    const { Client, LocalAuth } = await import("whatsapp-web.js");

    const waClient = new Client({
      authStrategy: new LocalAuth({ clientId: agentId }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      },
    });

    // Register event handlers
    waClient.on("qr", (qr: string) => {
      console.log(`[whatsapp:connect] QR received for agent ${agentId}`);
      setWhatsAppQRCode(agentId, qr);
    });

    waClient.on("authenticated", () => {
      console.log(`[whatsapp:connect] Authenticated for agent ${agentId}`);
      setWhatsAppConnecting(agentId);
    });

    waClient.on("ready", async () => {
      console.log(`[whatsapp:connect] Client ready for agent ${agentId}`);
      const info = waClient.info;
      const phoneNumber = info?.wid?.user ?? "unknown";
      setWhatsAppConnected(agentId, phoneNumber);

      // Update DB: set is_active = true
      await supabase
        .from("agent_channels")
        .update({ is_active: true })
        .eq("id", ch.id as string);
    });

    waClient.on("disconnected", async (reason: string) => {
      console.log(
        `[whatsapp:connect] Client disconnected for agent ${agentId}: ${reason}`,
      );
      setWhatsAppDisconnected(agentId);

      // Update DB: set is_active = false
      await supabase
        .from("agent_channels")
        .update({ is_active: false })
        .eq("id", ch.id as string);
    });

    // Start the client (triggers Puppeteer, QR flow)
    await waClient.initialize();
    clientStarted = true;
  } catch (err) {
    // whatsapp-web.js or Puppeteer not available
    console.warn(
      `[whatsapp:connect] Failed to initialise WhatsApp client for agent ${agentId}:`,
      err instanceof Error ? err.message : err,
    );

    return NextResponse.json(
      {
        error:
          "WhatsApp client could not be initialised. This may be because Puppeteer/Chromium is not available in this environment. In production, the WhatsApp client must run as a separate service.",
        code: "CHANNEL_INIT_ERROR",
      },
      { status: 500 },
    );
  }

  // -- 8. Return response — frontend should poll /status for the QR code ----
  return NextResponse.json({
    channel_id: ch.id as string,
    status: "qr_pending",
    message: clientStarted
      ? "WhatsApp client initialising. Poll GET /api/agents/[id]/whatsapp/status for the QR code."
      : "WhatsApp client could not be started. See server logs for details.",
  });
}
