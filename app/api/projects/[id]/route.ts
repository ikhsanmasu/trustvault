import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireProjectRole } from "@/lib/supabase/auth";
import type {
  GetProjectResponse,
  UpdateProjectResponse,
  ErrorResponse,
  Project,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validates that a string is a properly formatted UUID. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_NAME_LENGTH = 255;

// ---------------------------------------------------------------------------
// GET /api/projects/:id — Get project details (must be a member)
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<GetProjectResponse | ErrorResponse>> {
  // ── 1. requireAuth ─────────────────────────────────────────────────────
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const { id } = await params;

  // ── 2. Validate UUID ───────────────────────────────────────────────────
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid project ID format", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  // ── 3. Verify user is a member (RLS also enforces this) ────────────────
  const roleCheck = await requireProjectRole(supabase, user.id, id, [
    "admin",
    "editor",
    "viewer",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // ── 4. Fetch project ───────────────────────────────────────────────────
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !project) {
    return NextResponse.json(
      { error: `Project not found: ${id}`, code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    project: project as unknown as Project,
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/projects/:id — Update project name/description (admin only)
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<UpdateProjectResponse | ErrorResponse>> {
  // ── 1. requireAuth ─────────────────────────────────────────────────────
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const { id } = await params;

  // ── 2. Validate UUID ───────────────────────────────────────────────────
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid project ID format", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  // ── 3. Role check: admin only ──────────────────────────────────────────
  const roleCheck = await requireProjectRole(supabase, user.id, id, ["admin"]);
  if (!roleCheck.ok) return roleCheck.response;

  // ── 4. Parse request body ──────────────────────────────────────────────
  let body: { name?: string; description?: string };
  try {
    body = (await request.json()) as { name?: string; description?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  // ── 5. Validate at least one field provided ────────────────────────────
  const hasName = body.name !== undefined;
  const hasDesc = body.description !== undefined;

  if (!hasName && !hasDesc) {
    return NextResponse.json(
      { error: "At least one of name or description must be provided", code: "NO_FIELDS" },
      { status: 400 },
    );
  }

  // ── 6. Validate name if provided ───────────────────────────────────────
  const updates: Record<string, string> = {};

  if (hasName) {
    if (typeof body.name !== "string" || body.name!.trim().length === 0) {
      return NextResponse.json(
        { error: "Project name cannot be empty", code: "NAME_EMPTY" },
        { status: 400 },
      );
    }
    if (body.name!.trim().length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Project name must be ${MAX_NAME_LENGTH} characters or fewer`, code: "NAME_TOO_LONG" },
        { status: 400 },
      );
    }
    updates.name = body.name!.trim();
  }

  if (hasDesc) {
    updates.description = (body.description ?? "").trim();
  }

  // ── 7. Update project ──────────────────────────────────────────────────
  const { data: project, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !project) {
    if (process.env.NODE_ENV === "development") {
      console.error("[projects:update] DB error:", JSON.stringify(error));
    }
    return NextResponse.json(
      { error: "Failed to update project", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    project: project as unknown as Project,
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/projects/:id — Delete project (admin only)
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ deleted: boolean } | ErrorResponse>> {
  // ── 1. requireAuth ─────────────────────────────────────────────────────
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const { id } = await params;

  // ── 2. Validate UUID ───────────────────────────────────────────────────
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid project ID format", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  // ── 3. Role check: admin only ──────────────────────────────────────────
  const roleCheck = await requireProjectRole(supabase, user.id, id, ["admin"]);
  if (!roleCheck.ok) return roleCheck.response;

  // ── 4. Delete project (FK CASCADE removes members + documents) ────────
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[projects:delete] DB error:", JSON.stringify(error));
    }
    return NextResponse.json(
      { error: "Failed to delete project", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: true });
}
