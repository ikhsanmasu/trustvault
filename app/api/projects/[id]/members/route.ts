import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireProjectRole } from "@/lib/supabase/auth";
import type {
  ListMembersResponse,
  AddMemberResponse,
  ErrorResponse,
  ProjectMember,
  Role,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_ROLES: Role[] = ["admin", "editor", "viewer"];

// ---------------------------------------------------------------------------
// GET /api/projects/:id/members — List project members (must be a member)
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ListMembersResponse | ErrorResponse>> {
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

  // ── 3. Verify user is a member (any role) ──────────────────────────────
  const roleCheck = await requireProjectRole(supabase, user.id, id, ALLOWED_ROLES);
  if (!roleCheck.ok) return roleCheck.response;

  // ── 4. Query project members ───────────────────────────────────────────
  const { data: members, error } = await supabase
    .from("project_members")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch project members", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    members: (members ?? []) as unknown as ProjectMember[],
  });
}

// ---------------------------------------------------------------------------
// POST /api/projects/:id/members — Add a member (admin only)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<AddMemberResponse | ErrorResponse>> {
  // ── 1. requireAuth ─────────────────────────────────────────────────────
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const { id: projectId } = await params;

  // ── 2. Validate project UUID ───────────────────────────────────────────
  if (!UUID_RE.test(projectId)) {
    return NextResponse.json(
      { error: "Invalid project ID format", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  // ── 3. Role check: admin only ──────────────────────────────────────────
  const roleCheck = await requireProjectRole(supabase, user.id, projectId, ["admin"]);
  if (!roleCheck.ok) return roleCheck.response;

  // ── 4. Parse request body ──────────────────────────────────────────────
  let body: { user_id?: string; role?: string };
  try {
    body = (await request.json()) as { user_id?: string; role?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  // ── 5. Validate user_id ────────────────────────────────────────────────
  if (!body.user_id || typeof body.user_id !== "string" || !UUID_RE.test(body.user_id)) {
    return NextResponse.json(
      { error: "user_id must be a valid UUID", code: "INVALID_USER_ID" },
      { status: 400 },
    );
  }

  // ── 6. Validate role ───────────────────────────────────────────────────
  if (!body.role || !ALLOWED_ROLES.includes(body.role as Role)) {
    return NextResponse.json(
      { error: "role must be one of: admin, editor, viewer", code: "INVALID_ROLE" },
      { status: 400 },
    );
  }
  const targetRole = body.role as Role;

  // ── 7. Fetch project to get tenant_id ──────────────────────────────────
  const { data: project, error: projError } = await supabase
    .from("projects")
    .select("tenant_id")
    .eq("id", projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json(
      { error: `Project not found: ${projectId}`, code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // ── 8. Verify target user exists and is in the same tenant ─────────────
  const { data: targetProfile, error: profileError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", body.user_id)
    .single();

  if (profileError || !targetProfile) {
    return NextResponse.json(
      { error: "Target user not found or not in the same tenant", code: "USER_NOT_IN_TENANT" },
      { status: 400 },
    );
  }

  if (targetProfile.tenant_id !== project.tenant_id) {
    return NextResponse.json(
      { error: "Target user does not belong to the same tenant as the project", code: "USER_NOT_IN_TENANT" },
      { status: 400 },
    );
  }

  // ── 9. Insert member ───────────────────────────────────────────────────
  const { data: member, error: insertError } = await supabase
    .from("project_members")
    .insert({
      project_id: projectId,
      user_id: body.user_id,
      role: targetRole,
    })
    .select("*")
    .single();

  if (insertError) {
    // Check for unique violation (Postgres error code 23505)
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "User is already a member of this project", code: "ALREADY_MEMBER" },
        { status: 409 },
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.error("[members:add] DB error:", JSON.stringify(insertError));
    }
    return NextResponse.json(
      { error: "Failed to add member", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { member: member as unknown as ProjectMember },
    { status: 201 },
  );
}
