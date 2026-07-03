// ---------------------------------------------------------------------------
// TrustVault P16 — GET    /api/agents/[id] (get agent details)
//                   PATCH  /api/agents/[id] (update agent)
//                   DELETE /api/agents/[id] (delete agent)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Agent,
  AgentWithDetails,
  UpdateAgentRequest,
  GetAgentResponse,
  UpdateAgentResponse,
  DeleteAgentResponse,
  ErrorResponse,
  Document,
  AgentChannel,
} from "@/lib/types";
import {
  redactChannelConfig,
  markWhatsAppDisconnected,
  setTelegramDisconnected,
} from "@/lib/agent-channel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_NAME_LENGTH = 255;
const MAX_PROMPT_LENGTH = 10000;
const MAX_DOCUMENT_IDS = 100;

async function buildAgentWithDetails(
  supabase: SupabaseClient,
  agent: Agent,
): Promise<AgentWithDetails> {
  // Fetch linked document IDs
  const { data: agentDocs } = await supabase
    .from("agent_documents")
    .select("document_id")
    .eq("agent_id", agent.id);

  const docIds: string[] = (
    (agentDocs ?? []) as Array<{ document_id: string }>
  ).map((d) => d.document_id);

  // Fetch documents
  let documents: Document[] = [];
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("*")
      .in("id", docIds);

    documents = ((docs ?? []) as Array<Record<string, unknown>>).map(
      (d) =>
        ({
          id: d.id,
          name: d.name,
          storage_path: d.storage_path,
          binary_hash: d.binary_hash,
          text_hash: d.text_hash,
          extracted_text: d.extracted_text,
          file_size_bytes: d.file_size_bytes,
          file_type: d.file_type,
          tenant_id: d.tenant_id,
          uploaded_by: d.uploaded_by,
          created_at: d.created_at,
          deleted_at: d.deleted_at,
          deleted_by: d.deleted_by,
          description: d.description,
          notes: d.notes,
          fingerprint: d.fingerprint,
          chain: d.chain,
          tx_hash: d.tx_hash,
          anchored_at: d.anchored_at,
        }) as unknown as Document,
    );
  }

  // Fetch channels (with redacted config)
  const { data: channelRows } = await supabase
    .from("agent_channels")
    .select("*")
    .eq("agent_id", agent.id);

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

  return { ...agent, documents, channels };
}

async function fetchAgent(
  supabase: SupabaseClient,
  agentId: string,
): Promise<Agent | null> {
  const { data: row, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single();

  if (error || !row) return null;

  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    name: r.name as string,
    system_prompt: r.system_prompt as string,
    created_by: r.created_by as string,
    is_active: r.is_active as boolean,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// GET /api/agents/[id]
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<GetAgentResponse | ErrorResponse>> {
  const { id } = await params;

  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  // -- 2. Validate id -------------------------------------------------------
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid agent ID", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  // -- 3. Fetch agent -------------------------------------------------------
  const agent = await fetchAgent(supabase, id);
  if (!agent) {
    return NextResponse.json(
      { error: "Agent not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 4. Build details -----------------------------------------------------
  const detail = await buildAgentWithDetails(supabase, agent);

  return NextResponse.json({ agent: detail });
}

// ---------------------------------------------------------------------------
// PATCH /api/agents/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<UpdateAgentResponse | ErrorResponse>> {
  const { id } = await params;

  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Validate id -------------------------------------------------------
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid agent ID", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  // -- 3. Fetch agent -------------------------------------------------------
  const agent = await fetchAgent(supabase, id);
  if (!agent) {
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
  const { tenantId } = roleCheck;

  // -- 5. Parse body --------------------------------------------------------
  let body: UpdateAgentRequest;
  try {
    body = (await request.json()) as UpdateAgentRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_NAME" },
      { status: 400 },
    );
  }

  // -- 6. Validate fields if provided ---------------------------------------
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json(
        {
          error: "name must not be empty",
          code: "INVALID_NAME",
        },
        { status: 400 },
      );
    }
    if (body.name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        {
          error: `name must be at most ${MAX_NAME_LENGTH} characters`,
          code: "INVALID_NAME",
        },
        { status: 400 },
      );
    }
    updates.name = body.name.trim();
  }

  if (body.system_prompt !== undefined) {
    if (
      typeof body.system_prompt !== "string" ||
      body.system_prompt.trim().length === 0
    ) {
      return NextResponse.json(
        {
          error: "system_prompt must not be empty",
          code: "INVALID_SYSTEM_PROMPT",
        },
        { status: 400 },
      );
    }
    if (body.system_prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        {
          error: `system_prompt must be at most ${MAX_PROMPT_LENGTH} characters`,
          code: "INVALID_SYSTEM_PROMPT",
        },
        { status: 400 },
      );
    }
    updates.system_prompt = body.system_prompt.trim();
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json(
        { error: "is_active must be a boolean", code: "INVALID_IS_ACTIVE" },
        { status: 400 },
      );
    }
    updates.is_active = body.is_active;
  }

  // -- 7. Handle document_ids -----------------------------------------------
  if (body.document_ids !== undefined) {
    if (!Array.isArray(body.document_ids)) {
      return NextResponse.json(
        {
          error: "document_ids must be an array",
          code: "INVALID_DOCUMENT_IDS",
        },
        { status: 400 },
      );
    }
    if (body.document_ids.length > MAX_DOCUMENT_IDS) {
      return NextResponse.json(
        {
          error: `document_ids must have at most ${MAX_DOCUMENT_IDS} entries`,
          code: "INVALID_DOCUMENT_IDS",
        },
        { status: 400 },
      );
    }
    for (const docId of body.document_ids) {
      if (typeof docId !== "string" || !UUID_RE.test(docId)) {
        return NextResponse.json(
          {
            error: `Invalid document ID: ${docId}`,
            code: "INVALID_DOCUMENT_IDS",
          },
          { status: 400 },
        );
      }
    }

    // Verify documents belong to the tenant
    if (body.document_ids.length > 0) {
      const { data: tenantDocs } = await supabase
        .from("documents")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("id", body.document_ids);

      const foundIds = new Set(
        ((tenantDocs ?? []) as Array<{ id: string }>).map((d) => d.id),
      );
      for (const docId of body.document_ids) {
        if (!foundIds.has(docId)) {
          return NextResponse.json(
            {
              error: `Document ${docId} does not belong to your tenant`,
              code: "DOCUMENT_NOT_IN_TENANT",
            },
            { status: 400 },
          );
        }
      }
    }

    // Replace agent_documents: delete all existing, insert new
    await supabase
      .from("agent_documents")
      .delete()
      .eq("agent_id", id);

    if (body.document_ids.length > 0) {
      const rows = body.document_ids.map((docId) => ({
        agent_id: id,
        document_id: docId,
      }));
      await supabase.from("agent_documents").insert(rows);
    }
  }

  // -- 8. Apply updates -----------------------------------------------------
  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("agents")
      .update(updates)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update agent", code: "DB_ERROR" },
        { status: 500 },
      );
    }
  }

  // -- 9. Return updated agent ----------------------------------------------
  const updated = await fetchAgent(supabase, id);
  if (!updated) {
    return NextResponse.json(
      { error: "Agent not found after update", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const detail = await buildAgentWithDetails(supabase, updated);
  return NextResponse.json({ agent: detail });
}

// ---------------------------------------------------------------------------
// DELETE /api/agents/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<DeleteAgentResponse | ErrorResponse>> {
  const { id } = await params;

  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Validate id -------------------------------------------------------
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid agent ID", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  // -- 3. Fetch agent -------------------------------------------------------
  const agent = await fetchAgent(supabase, id);
  if (!agent) {
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

  // -- 5. Disconnect active channels ----------------------------------------
  try {
    markWhatsAppDisconnected(id);
    setTelegramDisconnected(id);
  } catch {
    // Ignore channel disconnect errors during delete
  }

  // -- 6. Delete agent (CASCADE handles child rows) -------------------------
  const { error: deleteError } = await supabase
    .from("agents")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete agent", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: true });
}
