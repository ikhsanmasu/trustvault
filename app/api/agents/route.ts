// ---------------------------------------------------------------------------
// TrustVault P16 — POST /api/agents (create agent)
//                     GET  /api/agents (list agents)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Agent,
  AgentWithDetails,
  CreateAgentRequest,
  CreateAgentResponse,
  ListAgentsResponse,
  ErrorResponse,
  Document,
  AgentChannel,
} from "@/lib/types";
import { redactChannelConfig } from "@/lib/agent-channel";
import { isValidUUID } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_NAME_LENGTH = 255;
const MAX_PROMPT_LENGTH = 10000;
const MAX_DOCUMENT_IDS = 100;

async function buildAgentWithDetails(
  supabase: SupabaseClient,
  agent: Agent,
  docIds: string[],
): Promise<AgentWithDetails> {
  // Fetch linked documents
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

// ---------------------------------------------------------------------------
// POST /api/agents — create a new agent
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<CreateAgentResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Check tenant role (editor+) ---------------------------------------
  const roleCheck = await requireTenantRole(supabase, user.id, [
    "owner", "admin", "editor",
  ]);
  if (!roleCheck.ok) return roleCheck.response;
  const { tenantId } = roleCheck;

  // -- 3. Parse body --------------------------------------------------------
  let body: CreateAgentRequest;
  try {
    body = (await request.json()) as CreateAgentRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_NAME" },
      { status: 400 },
    );
  }

  // -- 4. Validate name -----------------------------------------------------
  if (
    !body.name ||
    typeof body.name !== "string" ||
    body.name.trim().length === 0
  ) {
    return NextResponse.json(
      { error: "name is required and must not be empty", code: "INVALID_NAME" },
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

  // -- 5. Validate system_prompt --------------------------------------------
  if (
    !body.system_prompt ||
    typeof body.system_prompt !== "string" ||
    body.system_prompt.trim().length === 0
  ) {
    return NextResponse.json(
      {
        error: "system_prompt is required and must not be empty",
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

  // -- 6. Validate document_ids ---------------------------------------------
  const documentIds = body.document_ids ?? [];
  if (!Array.isArray(documentIds)) {
    return NextResponse.json(
      {
        error: "document_ids must be an array",
        code: "INVALID_DOCUMENT_IDS",
      },
      { status: 400 },
    );
  }
  if (documentIds.length > MAX_DOCUMENT_IDS) {
    return NextResponse.json(
      {
        error: `document_ids must have at most ${MAX_DOCUMENT_IDS} entries`,
        code: "INVALID_DOCUMENT_IDS",
      },
      { status: 400 },
    );
  }
  for (const docId of documentIds) {
    if (typeof docId !== "string" || !isValidUUID(docId)) {
      return NextResponse.json(
        {
          error: `Invalid document ID: ${docId}`,
          code: "INVALID_DOCUMENT_IDS",
        },
        { status: 400 },
      );
    }
  }

  // -- 7. Verify documents belong to the tenant -----------------------------
  if (documentIds.length > 0) {
    const { data: tenantDocs } = await supabase
      .from("documents")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", documentIds);

    const foundIds = new Set(
      ((tenantDocs ?? []) as Array<{ id: string }>).map((d) => d.id),
    );
    for (const docId of documentIds) {
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

  // -- 8. Insert agent ------------------------------------------------------
  const { data: agentRow, error: insertError } = await supabase
    .from("agents")
    .insert({
      tenant_id: tenantId,
      name: body.name.trim(),
      system_prompt: body.system_prompt.trim(),
      created_by: user.id,
      is_active: true,
    })
    .select("*")
    .single();

  if (insertError || !agentRow) {
    return NextResponse.json(
      { error: "Failed to create agent", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const row = agentRow as Record<string, unknown>;
  const agent: Agent = {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    name: row.name as string,
    system_prompt: row.system_prompt as string,
    created_by: row.created_by as string,
    is_active: row.is_active as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };

  // -- 9. Insert agent_documents --------------------------------------------
  if (documentIds.length > 0) {
    const rows = documentIds.map((docId) => ({
      agent_id: agent.id,
      document_id: docId,
    }));
    await supabase.from("agent_documents").insert(rows);
  }

  // -- 10. Return agent with details ----------------------------------------
  const detail = await buildAgentWithDetails(supabase, agent, documentIds);

  return NextResponse.json({ agent: detail }, { status: 201 });
}

// ---------------------------------------------------------------------------
// GET /api/agents — list agents in the tenant
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
): Promise<NextResponse<ListAgentsResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  // -- 2. Get tenant_id -----------------------------------------------------
  const roleCheck = await requireTenantRole(supabase, auth.user.id, [
    "owner", "admin", "editor", "viewer",
  ]);
  if (!roleCheck.ok) return roleCheck.response;
  const { tenantId } = roleCheck;

  // -- 3. Query agents ------------------------------------------------------
  const { data: rows, error } = await supabase
    .from("agents")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch agents", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const agents: Agent[] = ((rows ?? []) as Array<Record<string, unknown>>).map(
    (r) => ({
      id: r.id as string,
      tenant_id: r.tenant_id as string,
      name: r.name as string,
      system_prompt: r.system_prompt as string,
      created_by: r.created_by as string,
      is_active: r.is_active as boolean,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    }),
  );

  return NextResponse.json({ agents, total: agents.length });
}
