// ---------------------------------------------------------------------------
// TrustVault P16 — GET    /api/agents/[id]/chat/sessions/[sessionId]
//                   DELETE /api/agents/[id]/chat/sessions/[sessionId]
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import type {
  AgentSession,
  AgentMessage,
  GetAgentSessionResponse,
  DeleteAgentSessionResponse,
  ErrorResponse,
} from "@/lib/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// GET /api/agents/[id]/chat/sessions/[sessionId]
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<NextResponse<GetAgentSessionResponse | ErrorResponse>> {
  const { id: agentId, sessionId } = await params;

  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Validate UUIDs ----------------------------------------------------
  if (!UUID_RE.test(agentId)) {
    return NextResponse.json(
      { error: "Invalid agent ID", code: "INVALID_AGENT_ID" },
      { status: 400 },
    );
  }
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json(
      { error: "Invalid session ID", code: "INVALID_SESSION_ID" },
      { status: 400 },
    );
  }

  // -- 3. Fetch session (RLS ensures user owns it) --------------------------
  const { data: sessionRow, error: sessionError } = await supabase
    .from("agent_sessions")
    .select("id, agent_id, user_id, title, created_at, updated_at")
    .eq("id", sessionId)
    .single();

  if (sessionError || !sessionRow) {
    return NextResponse.json(
      { error: "Session not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const sr = sessionRow as Record<string, unknown>;

  // Verify session belongs to user and agent
  if (
    (sr.user_id as string) !== user.id ||
    (sr.agent_id as string) !== agentId
  ) {
    return NextResponse.json(
      { error: "Session not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const session: AgentSession = {
    id: sr.id as string,
    agent_id: sr.agent_id as string,
    user_id: sr.user_id as string,
    title: sr.title as string,
    created_at: sr.created_at as string,
    updated_at: sr.updated_at as string,
  };

  // -- 4. Fetch messages ----------------------------------------------------
  const { data: messageRows, error: msgError } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (msgError) {
    return NextResponse.json(
      { error: "Failed to fetch messages", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const messages: AgentMessage[] = (
    (messageRows ?? []) as Array<Record<string, unknown>>
  ).map((m) => ({
    id: m.id as string,
    agent_id: m.agent_id as string,
    session_id: m.session_id as string,
    role: m.role as "user" | "assistant",
    content: m.content as string,
    channel: (m.channel as string) ?? null,
    external_user_id: (m.external_user_id as string) ?? null,
    citations: (m.citations as AgentMessage["citations"]) ?? null,
    created_at: m.created_at as string,
  }));

  return NextResponse.json({ session, messages });
}

// ---------------------------------------------------------------------------
// DELETE /api/agents/[id]/chat/sessions/[sessionId]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
): Promise<NextResponse<DeleteAgentSessionResponse | ErrorResponse>> {
  const { id: agentId, sessionId } = await params;

  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Validate UUIDs ----------------------------------------------------
  if (!UUID_RE.test(agentId)) {
    return NextResponse.json(
      { error: "Invalid agent ID", code: "INVALID_AGENT_ID" },
      { status: 400 },
    );
  }
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json(
      { error: "Invalid session ID", code: "INVALID_SESSION_ID" },
      { status: 400 },
    );
  }

  // -- 3. Verify session belongs to user ------------------------------------
  const { data: sessionRow } = await supabase
    .from("agent_sessions")
    .select("id, user_id, agent_id")
    .eq("id", sessionId)
    .eq("agent_id", agentId)
    .single();

  if (!sessionRow) {
    return NextResponse.json(
      { error: "Session not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const sr = sessionRow as Record<string, unknown>;
  if ((sr.user_id as string) !== user.id) {
    return NextResponse.json(
      { error: "Session not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 4. Delete session (CASCADE deletes messages) -------------------------
  const { error: deleteError } = await supabase
    .from("agent_sessions")
    .delete()
    .eq("id", sessionId);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete session", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: true });
}
