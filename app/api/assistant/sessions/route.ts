import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireProjectRole } from "@/lib/supabase/auth";
import type {
  ListSessionsResponse,
  ErrorResponse,
  ChatSession,
} from "@/lib/types";
import { isValidUUID } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /api/assistant/sessions
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ListSessionsResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const searchParams = request.nextUrl.searchParams;

  // -- 2. Parse optional project_id ------------------------------------------
  const projectIdRaw = searchParams.get("project_id")?.trim();
  const projectId = projectIdRaw && isValidUUID(projectIdRaw) ? projectIdRaw : null;

  // -- 3. Query sessions (all user sessions if no project filter) ------------
  let query = supabase
    .from("chat_sessions")
    .select("id, project_id, user_id, title, created_at, updated_at")
    .eq("user_id", user.id);

  if (projectId) query = query.eq("project_id", projectId);

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
