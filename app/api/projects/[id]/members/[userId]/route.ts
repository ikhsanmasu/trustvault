import { type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireProjectRole } from "@/lib/supabase/auth";
import type {
  UpdateMemberRoleResponse,
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

/**
 * Counts the number of admins in the project (excluding the given user_id
 * when `excludeUserId` is provided). Used for last-admin protection.
 */
async function countAdmins(
  supabase: SupabaseClient,
  projectId: string,
  excludeUserId?: string,
): Promise<number> {
  let query = supabase
    .from("project_members")
    .select("id", { count: "exact" })
    .eq("project_id", projectId)
    .eq("role", "admin");

  if (excludeUserId) {
    query = query.neq("user_id", excludeUserId);
  }

  const { count, error } = await query;

  if (error) {
    // If we can't count, err on the side of safety — don't block the
    // operation due to a count failure. The caller should handle the 500.
    throw new Error("Failed to count admins");
  }

  return count ?? 0;
}

// ---------------------------------------------------------------------------
// PATCH /api/projects/:id/members/:userId — Update member role (admin only)
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
): Promise<NextResponse<UpdateMemberRoleResponse | ErrorResponse>> {
  // ── 1. requireAuth ─────────────────────────────────────────────────────
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const { id: projectId, userId: targetUserId } = await params;

  // ── 2. Validate UUIDs ──────────────────────────────────────────────────
  if (!UUID_RE.test(projectId) || !UUID_RE.test(targetUserId)) {
    return NextResponse.json(
      { error: "Invalid project or user ID format", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  // ── 3. Role check: admin only ──────────────────────────────────────────
  const roleCheck = await requireProjectRole(supabase, user.id, projectId, ["admin"]);
  if (!roleCheck.ok) return roleCheck.response;

  // ── 4. Parse request body ──────────────────────────────────────────────
  let body: { role?: string };
  try {
    body = (await request.json()) as { role?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  // ── 5. Validate role ───────────────────────────────────────────────────
  if (!body.role || !ALLOWED_ROLES.includes(body.role as Role)) {
    return NextResponse.json(
      { error: "role must be one of: admin, editor, viewer", code: "INVALID_ROLE" },
      { status: 400 },
    );
  }
  const newRole = body.role as Role;

  // ── 6. Self-demotion check (last-admin protection) ─────────────────────
  if (targetUserId === user.id && newRole !== "admin") {
    try {
      const otherAdmins = await countAdmins(supabase, projectId, user.id);
      if (otherAdmins === 0) {
        return NextResponse.json(
          {
            error: "Cannot demote yourself — you are the last admin of this project",
            code: "LAST_ADMIN",
          },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Failed to verify admin count", code: "DB_ERROR" },
        { status: 500 },
      );
    }
  }

  // ── 7. Update member role ──────────────────────────────────────────────
  const { data: member, error } = await supabase
    .from("project_members")
    .update({ role: newRole })
    .eq("project_id", projectId)
    .eq("user_id", targetUserId)
    .select("*")
    .single();

  if (error || !member) {
    return NextResponse.json(
      { error: `Member not found for user ${targetUserId} in project ${projectId}`, code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    member: member as unknown as ProjectMember,
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/projects/:id/members/:userId — Remove a member (admin only)
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
): Promise<NextResponse<{ removed: boolean } | ErrorResponse>> {
  // ── 1. requireAuth ─────────────────────────────────────────────────────
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const { id: projectId, userId: targetUserId } = await params;

  // ── 2. Validate UUIDs ──────────────────────────────────────────────────
  if (!UUID_RE.test(projectId) || !UUID_RE.test(targetUserId)) {
    return NextResponse.json(
      { error: "Invalid project or user ID format", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  // ── 3. Role check: admin only ──────────────────────────────────────────
  const roleCheck = await requireProjectRole(supabase, user.id, projectId, ["admin"]);
  if (!roleCheck.ok) return roleCheck.response;

  // ── 4. Last-admin check (if removing self) ─────────────────────────────
  if (targetUserId === user.id) {
    try {
      const otherAdmins = await countAdmins(supabase, projectId, user.id);
      if (otherAdmins === 0) {
        return NextResponse.json(
          {
            error: "Cannot remove yourself — you are the last admin of this project",
            code: "LAST_ADMIN",
          },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Failed to verify admin count", code: "DB_ERROR" },
        { status: 500 },
      );
    }
  }

  // ── 5. Delete member ───────────────────────────────────────────────────
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", targetUserId);

  if (error) {
    return NextResponse.json(
      { error: `Member not found for user ${targetUserId} in project ${projectId}`, code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({ removed: true });
}
