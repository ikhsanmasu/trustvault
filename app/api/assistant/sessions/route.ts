import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireProjectRole } from "@/lib/supabase/auth";
import type {
  ListSessionsResponse,
  ErrorResponse,
  ChatSession,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // -- 2. Validate project_id query param -----------------------------------
  const projectIdRaw = searchParams.get("project_id");
  if (!projectIdRaw || projectIdRaw.trim().length === 0) {
    return NextResponse.json(
      {
        error: "project_id query parameter is required",
        code: "MISSING_PROJECT_ID",
      },
      { status: 400 },
    );
  }

  const projectId = projectIdRaw.trim();

  if (!UUID_RE.test(projectId)) {
    return NextResponse.json(
      {
        error: "project_id must be a valid UUID",
        code: "MISSING_PROJECT_ID",
      },
      { status: 400 },
    );
  }

  // -- 3. Verify project membership -----------------------------------------
  const roleCheck = await requireProjectRole(supabase, user.id, projectId, [
    "admin",
    "editor",
    "viewer",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // -- 4. Query sessions for user + project ---------------------------------
  const { data: sessions, error } = await supabase
    .from("chat_sessions")
    .select("id, project_id, user_id, title, created_at, updated_at")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
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
