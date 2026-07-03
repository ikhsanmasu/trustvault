import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/client";
import type { JoinResponse, ErrorResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** A valid invitation token is exactly 64 lowercase hex characters. */
const TOKEN_RE = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// GET /api/tenant/join -- Accept an invitation to join a tenant
// Requires: any authenticated user (no prior tenant membership needed)
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse<JoinResponse | ErrorResponse>> {
  // -- 1. requireAuth (any authenticated user -- no tenant membership needed)
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Validate token query parameter ------------------------------------
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get("token");

  if (!token || typeof token !== "string" || !TOKEN_RE.test(token)) {
    return NextResponse.json(
      {
        error:
          "A valid invitation token is required (64-character hex string)",
        code: "INVALID_TOKEN",
      },
      { status: 400 },
    );
  }

  // -- 3. Look up the invitation (use service client since the user may not
  //       have a tenant membership yet, so RLS on invitations would block them)
  const serviceClient = createServiceClient();

  const { data: invitation, error: lookUpError } = await serviceClient
    .from("invitations")
    .select("*")
    .eq("token", token)
    .single();

  if (lookUpError || !invitation) {
    return NextResponse.json(
      { error: "Invitation not found", code: "INVITATION_NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 4. Expiry check ------------------------------------------------------
  const expiresAt = new Date(invitation.expires_at as string);
  if (expiresAt <= new Date()) {
    return NextResponse.json(
      { error: "This invitation has expired", code: "INVITATION_EXPIRED" },
      { status: 410 },
    );
  }

  // -- 5. Already accepted check --------------------------------------------
  if (invitation.accepted_at) {
    return NextResponse.json(
      {
        error: "This invitation has already been accepted",
        code: "INVITATION_ALREADY_ACCEPTED",
      },
      { status: 409 },
    );
  }

  // -- 6. Email match (case-insensitive) ------------------------------------
  const authUserEmail = user.email?.toLowerCase();
  const invitationEmail = (invitation.email as string).toLowerCase();

  if (!authUserEmail || authUserEmail !== invitationEmail) {
    return NextResponse.json(
      {
        error:
          "Your email does not match the email on this invitation. Please sign in with the correct email.",
        code: "EMAIL_MISMATCH",
      },
      { status: 403 },
    );
  }

  // -- 7. Check user is not already in a tenant -----------------------------
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (profileError) {
    // If the error is "no rows", that's fine — the user may not have a profile yet.
    // If it's another error, it's a problem.
    if (profileError.code !== "PGRST116") {
      return NextResponse.json(
        { error: "Failed to check profile", code: "DB_ERROR" },
        { status: 500 },
      );
    }
  }

  if (profile?.tenant_id) {
    return NextResponse.json(
      {
        error: "You already belong to a tenant. Leave your current tenant before joining another.",
        code: "ALREADY_IN_TENANT",
      },
      { status: 409 },
    );
  }

  // -- 8. Update the user's profile with the tenant and role ----------------
  // Use service-role client because the user-scoped RLS would block the
  // UPDATE (the user has no tenant_id, so policies may reject).
  const { error: updateError } = await serviceClient
    .from("profiles")
    .update({
      tenant_id: invitation.tenant_id,
      role: invitation.role,
    })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update profile", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // -- 9. Mark the invitation as accepted -----------------------------------
  const { error: acceptError } = await serviceClient
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  if (acceptError) {
    // The user has been added to the tenant but the invitation wasn't marked.
    // Log it but don't fail the request — the user is already in the tenant.
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[join] Failed to mark invitation as accepted:",
        JSON.stringify(acceptError),
      );
    }
  }

  // -- 10. Return 200 -------------------------------------------------------
  return NextResponse.json({
    tenant_id: invitation.tenant_id as string,
    role: invitation.role as string,
  });
}
