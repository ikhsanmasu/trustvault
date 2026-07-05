import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import type {
  ListSessionsResponse,
  ErrorResponse,
  ChatSession,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /api/assistant/sessions
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
): Promise<NextResponse<ListSessionsResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Query sessions -----------------------------------------------------
  const query = supabase
    .from("chat_sessions")
    .select("id, user_id, title, created_at, updated_at")
    .eq("user_id", user.id);

  const { data: sessions, error } = await query
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch sessions", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    sessions: (sessions ?? []) as unknown as ChatSession[],
  });
}
