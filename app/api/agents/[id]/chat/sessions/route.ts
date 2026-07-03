// ---------------------------------------------------------------------------
// TrustVault P16 — GET /api/agents/[id]/chat/sessions
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import type {
  AgentSession,
  ListAgentSessionsResponse,
  ErrorResponse,
} from "@/lib/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ListAgentSessionsResponse | ErrorResponse>> {
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

  // -- 4. Query sessions for this agent + user ------------------------------
  const { data: rows, error } = await supabase
    .from("agent_sessions")
    .select("id, agent_id, user_id, title, created_at, updated_at")
    .eq("agent_id", agentId)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch sessions", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const sessions: AgentSession[] = (
    (rows ?? []) as Array<Record<string, unknown>>
  ).map((r) => ({
    id: r.id as string,
    agent_id: r.agent_id as string,
    user_id: r.user_id as string,
    title: r.title as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }));

  return NextResponse.json({ sessions });
}
