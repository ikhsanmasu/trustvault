import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/client";
import { sendEmail, buildInvitationEmail } from "@/lib/email";
import type {
  InviteResponse,
  ErrorResponse,
  InviteRequest,
  Invitation,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_ROLES = ["admin", "editor", "viewer"] as const;
const MAX_EMAIL_LENGTH = 255;
const INVITATION_EXPIRY_DAYS = 7;

/** Basic email format validation: must be non-empty, <= 255 chars, and contain '@'. */
function isValidEmail(email: string): boolean {
  return email.length > 0 && email.length <= MAX_EMAIL_LENGTH && email.includes("@");
}

// ---------------------------------------------------------------------------
// POST /api/tenant/invite -- Send an invitation to join the tenant
// Requires: admin or owner role
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<InviteResponse | ErrorResponse>> {
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

  // -- 3. Parse request body ------------------------------------------------
  let body: InviteRequest;
  try {
    body = (await request.json()) as InviteRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  // -- 4. Validate email ----------------------------------------------------
  if (
    !body.email ||
    typeof body.email !== "string" ||
    !isValidEmail(body.email.trim())
  ) {
    return NextResponse.json(
      {
        error:
          "A valid email address is required (max 255 characters, must contain '@')",
        code: "INVALID_EMAIL",
      },
      { status: 400 },
    );
  }

  const normalizedEmail = body.email.trim().toLowerCase();

  // -- 5. Validate role -----------------------------------------------------
  if (
    !body.role ||
    typeof body.role !== "string" ||
    !ALLOWED_ROLES.includes(body.role as (typeof ALLOWED_ROLES)[number])
  ) {
    return NextResponse.json(
      {
        error: `role must be one of: ${ALLOWED_ROLES.join(", ")}`,
        code: "INVALID_ROLE",
      },
      { status: 400 },
    );
  }

  // -- 6. Admin cannot invite as admin (only owner can) ----------------------
  if (callerRole === "admin" && body.role === "admin") {
    return NextResponse.json(
      {
        error: "Only the owner can invite new admins",
        code: "ADMINS_CANNOT_INVITE_ADMINS",
      },
      { status: 403 },
    );
  }

  // -- 7. Check if invitee is already a member (service client) --------------
  const serviceClient = createServiceClient();

  // Look up the invitee email in auth.users, then check their profile
  const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
  const existingUser = existingUsers?.users.find(
    (u) => u.email?.toLowerCase() === normalizedEmail,
  );

  if (existingUser) {
    // Check if they are already in this tenant
    const { data: existingProfile } = await serviceClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", existingUser.id)
      .single();

    if (existingProfile && existingProfile.tenant_id === tenantId) {
      return NextResponse.json(
        {
          error: "This email is already a member of your tenant",
          code: "ALREADY_MEMBER",
        },
        { status: 409 },
      );
    }
  }

  // -- 8. Revoke any existing pending invitation for this email in this tenant
  const { error: revokeError } = await serviceClient
    .from("invitations")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("email", normalizedEmail)
    .is("accepted_at", null);

  if (revokeError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[invite] Revoke error:", JSON.stringify(revokeError));
    }
  }

  // -- 9. Generate token ----------------------------------------------------
  const token = randomBytes(32).toString("hex"); // 64-char hex string

  // -- 10. Compute expiry ---------------------------------------------------
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

  // -- 11. Insert invitation (use service client because RLS on invitations
  //       requires tenant membership for INSERT, which the service client bypasses)
  const { data: invitation, error: insertError } = await serviceClient
    .from("invitations")
    .insert({
      tenant_id: tenantId,
      email: normalizedEmail,
      role: body.role,
      token,
      created_by: user.id,
      expires_at: expiresAt.toISOString(),
    })
    .select("*")
    .single();

  if (insertError || !invitation) {
    return NextResponse.json(
      { error: "Failed to create invitation", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // -- 12. Send invitation email ---------------------------------------------
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    `https://${request.headers.get("host") ?? "localhost:3000"}`;
  const joinLink = `${appUrl}/join?token=${token}`;

  // Get inviter name for the email
  const inviterName = user.email ?? "Someone";
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single();
  const tenantName = (tenantRow?.name as string) ?? "a workspace";

  const emailTemplate = buildInvitationEmail({
    inviterName,
    tenantName,
    role: body.role,
    acceptUrl: joinLink,
  });

  // Fire-and-forget: don't block the response on email delivery
  sendEmail({ ...emailTemplate, to: normalizedEmail }).catch((err) => {
    console.error("[invite] Failed to send invitation email:", err);
  });

  // -- 13. Return 201 (token is NOT returned in the response) ----------------
  const invitationResponse: Invitation = {
    id: invitation.id as string,
    tenant_id: invitation.tenant_id as string,
    email: invitation.email as string,
    role: invitation.role as Invitation["role"],
    created_by: invitation.created_by as string,
    created_at: invitation.created_at as string,
    expires_at: invitation.expires_at as string,
    accepted_at: invitation.accepted_at as string | null,
  };

  return NextResponse.json({ invitation: invitationResponse }, { status: 201 });
}
