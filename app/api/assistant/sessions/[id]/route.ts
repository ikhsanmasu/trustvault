import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import type {
  GetSessionResponse,
  ErrorResponse,
  ChatSession,
  ChatMessage,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// GET /api/assistant/sessions/:id
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<GetSessionResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { id } = await params;

  // -- 2. Validate UUID -----------------------------------------------------
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid session ID format", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  // -- 3. Fetch session (RLS ensures user owns it) --------------------------
  const { data: session, error: sessionError } = await supabase
    .from("chat_sessions")
    .select("id, project_id, user_id, title, created_at, updated_at")
    .eq("id", id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: `Session not found: ${id}`, code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 4. Fetch messages ----------------------------------------------------
  const { data: messages, error: msgError } = await supabase
    .from("chat_messages")
    .select("id, session_id, role, content, citations, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  if (msgError) {
    return NextResponse.json(
      { error: "Failed to fetch messages", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    session: session as unknown as ChatSession,
    messages: (messages ?? []) as unknown as ChatMessage[],
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/assistant/sessions/:id
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ deleted: boolean } | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { id } = await params;

  // -- 2. Validate UUID -----------------------------------------------------
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid session ID format", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  // -- 3. Delete session (RLS + CASCADE handles messages) -------------------
  const { error, count } = await supabase
    .from("chat_sessions")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete session", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  if ((count ?? 0) === 0) {
    return NextResponse.json(
      { error: `Session not found: ${id}`, code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({ deleted: true });
}
