import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/client";
import type {
  UpdateMemberRoleResponse,
  RemoveMemberResponse,
  ErrorResponse,
  TenantMember,
  TenantRole,
} from "@/lib/types";
import { isValidUUID } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALLOWED_ROLES: TenantRole[] = ["admin", "editor", "viewer"];

// ---------------------------------------------------------------------------
// PATCH /api/tenant/members/[userId] -- Update a member's role
// Requires: admin or owner (with additional rules)
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse<UpdateMemberRoleResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Calling user must be admin or owner --------------------------------
  const callerRoleCheck = await requireTenantRole(supabase, user.id, [
    "owner",
    "admin",
  ]);
  if (!callerRoleCheck.ok) return callerRoleCheck.response;
  const { role: callerRole, tenantId } = callerRoleCheck;

  const { userId } = await params;

  // -- 4. Validate userId ----------------------------------------------------
  if (!isValidUUID(userId)) {
    return NextResponse.json(
      { error: "userId must be a valid UUID", code: "INVALID_USER_ID" },
      { status: 400 },
    );
  }

  // -- 5. Parse request body ------------------------------------------------
  let body: { role?: string };
  try {
    body = (await request.json()) as { role?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  // -- 6. Validate the target role ------------------------------------------
  if (
    !body.role ||
    typeof body.role !== "string" ||
    !ALLOWED_ROLES.includes(body.role as TenantRole)
  ) {
    return NextResponse.json(
      {
        error: `role must be one of: ${ALLOWED_ROLES.join(", ")}`,
        code: "INVALID_ROLE",
      },
      { status: 400 },
    );
  }

  const newRole = body.role as Exclude<TenantRole, "owner">;

  // -- 7. Fetch target user's profile (use service client for cross-profile) -
  const serviceClient = createServiceClient();

  const { data: targetProfile, error: targetError } = await serviceClient
    .from("profiles")
    .select("id, role, tenant_id, display_name, created_at")
    .eq("id", userId)
    .single();

  if (targetError || !targetProfile) {
    return NextResponse.json(
      { error: "Member not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 8. Verify target is in the same tenant --------------------------------
  if (targetProfile.tenant_id !== tenantId) {
    return NextResponse.json(
      { error: "Member not found in this tenant", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 9. Owner protection: cannot change owner's role -----------------------
  if (targetProfile.role === "owner") {
    return NextResponse.json(
      { error: "Cannot modify the owner's role", code: "CANNOT_MODIFY_OWNER" },
      { status: 403 },
    );
  }

  // -- 10. Admin-to-admin restriction: admin cannot change another admin ----
  if (callerRole === "admin" && targetProfile.role === "admin") {
    return NextResponse.json(
      {
        error: "Only the owner can change an admin's role",
        code: "ADMINS_CANNOT_MODIFY_ADMINS",
      },
      { status: 403 },
    );
  }

  // -- 11. Self-demotion check: if caller is demoting themselves ------------
  if (userId === user.id && callerRole === "admin" && newRole !== "admin") {
    // Count remaining admins + owners in the tenant
    const { data: admins, error: countError } = await serviceClient
      .from("profiles")
      .select("id, role")
      .eq("tenant_id", tenantId)
      .in("role", ["owner", "admin"]);

    if (countError || !admins) {
      return NextResponse.json(
        { error: "Failed to verify admin count", code: "DB_ERROR" },
        { status: 500 },
      );
    }

    if (admins.length <= 1) {
      return NextResponse.json(
        {
          error:
            "Cannot demote yourself: you are the last admin in this tenant",
          code: "LAST_ADMIN",
        },
        { status: 400 },
      );
    }
  }

  // -- 12. Update the role (service client for cross-profile write) ---------
  const { error: updateError } = await serviceClient
    .from("profiles")
    .update({ role: newRole })
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update member role", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // -- 13. Fetch email for response -----------------------------------------
  const { data: authUser } = await serviceClient.auth.admin.getUserById(userId);
  const email = authUser?.user?.email ?? "";

  // -- 14. Return 200 -------------------------------------------------------
  const member: TenantMember = {
    id: userId,
    email,
    display_name: targetProfile.display_name,
    role: newRole,
    created_at: targetProfile.created_at,
  };

  return NextResponse.json({ member });
}

// ---------------------------------------------------------------------------
// DELETE /api/tenant/members/[userId] -- Remove a member from the tenant
// Requires: admin or owner (with additional rules)
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse<RemoveMemberResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Calling user must be admin or owner --------------------------------
  const callerRoleCheck = await requireTenantRole(supabase, user.id, [
    "owner",
    "admin",
  ]);
  if (!callerRoleCheck.ok) return callerRoleCheck.response;
  const { role: callerRole, tenantId } = callerRoleCheck;

  const { userId } = await params;

  // -- 3. Validate userId ----------------------------------------------------
  if (!isValidUUID(userId)) {
    return NextResponse.json(
      { error: "userId must be a valid UUID", code: "INVALID_USER_ID" },
      { status: 400 },
    );
  }

  // -- 4. Fetch target user's profile (use service client for cross-profile) -
  const serviceClient = createServiceClient();

  const { data: targetProfile, error: targetError } = await serviceClient
    .from("profiles")
    .select("id, role, tenant_id")
    .eq("id", userId)
    .single();

  if (targetError || !targetProfile) {
    return NextResponse.json(
      { error: "Member not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 5. Verify target is in the same tenant --------------------------------
  if (targetProfile.tenant_id !== tenantId) {
    return NextResponse.json(
      { error: "Member not found in this tenant", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 6. Owner protection: cannot remove the owner --------------------------
  if (targetProfile.role === "owner") {
    return NextResponse.json(
      {
        error: "Cannot remove the owner from the tenant",
        code: "CANNOT_REMOVE_OWNER",
      },
      { status: 403 },
    );
  }

  // -- 7. Admin-to-admin restriction: admin cannot remove another admin ------
  if (callerRole === "admin" && targetProfile.role === "admin") {
    return NextResponse.json(
      {
        error: "Only the owner can remove an admin",
        code: "ADMINS_CANNOT_REMOVE_ADMINS",
      },
      { status: 403 },
    );
  }

  // -- 8. Self-removal check: if caller is removing themselves --------------
  if (userId === user.id) {
    // Count remaining admins + owners (including the caller)
    const { data: admins, error: countError } = await serviceClient
      .from("profiles")
      .select("id, role")
      .eq("tenant_id", tenantId)
      .in("role", ["owner", "admin"]);

    if (countError || !admins) {
      return NextResponse.json(
        { error: "Failed to verify admin count", code: "DB_ERROR" },
        { status: 500 },
      );
    }

    if (admins.length <= 1) {
      return NextResponse.json(
        {
          error:
            "Cannot remove yourself: you are the last admin in this tenant",
          code: "LAST_ADMIN",
        },
        { status: 400 },
      );
    }
  }

  // -- 9. Remove the user from the tenant: set tenant_id = NULL, role = 'viewer'
  // This preserves their account but removes them from the tenant.
  // We use the service-role client because the target user may not satisfy
  // the profiles_update_own RLS policy (different user).
  const { error: updateError } = await serviceClient
    .from("profiles")
    .update({ tenant_id: null, role: "viewer" })
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to remove member", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // -- 10. Return 200 -------------------------------------------------------
  return NextResponse.json({ removed: true });
}
