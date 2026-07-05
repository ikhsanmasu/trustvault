import { type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { setMonitoringUser } from "@/lib/monitoring";
import { apiError } from "@/lib/utils";
import type { ErrorResponse, TenantRole } from "@/lib/types";

// ---------------------------------------------------------------------------
// Auth result types
// ---------------------------------------------------------------------------

export type AuthSuccess = {
  ok: true;
  user: User;
  supabase: SupabaseClient;
};

export type AuthFailure = {
  ok: false;
  response: NextResponse<ErrorResponse>;
};

export type AuthResult = AuthSuccess | AuthFailure;

// ---------------------------------------------------------------------------
// requireAuth — validate session, return user + user-scoped client
// ---------------------------------------------------------------------------

/**
 * Validates the current Supabase session from the request's HTTP-only cookie.
 *
 * On success, returns `{ ok: true, user, supabase }` where `supabase` is a
 * user-scoped client (all queries go through RLS).
 *
 * On failure, returns `{ ok: false, response }` with a 401 response. The
 * caller must immediately return this response — no business logic should
 * run before auth is verified.
 */
export async function requireAuth(): Promise<AuthResult> {
  const supabase = await createRouteHandlerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false,
      response: apiError("Authentication required", "UNAUTHORIZED", 401) as NextResponse<ErrorResponse>,
    };
  }

  // Attach user context for error monitoring
  setMonitoringUser({
    id: user.id,
    email: user.email,
  });

  return { ok: true, user, supabase };
}

// ---------------------------------------------------------------------------
// getUserTenantId — fetch the current user's tenant_id from profiles
// ---------------------------------------------------------------------------

/**
 * Returns the `tenant_id` from the `profiles` row for the current user.
 *
 * Uses the user-scoped Supabase client (RLS on `profiles` only allows
 * reading one's own profile).
 *
 * Returns `null` if the profile row does not exist (should not happen if the
 * sign-up trigger is correctly installed).
 */
export async function getUserTenantId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    return null;
  }

  return profile.tenant_id as string;
}

// ---------------------------------------------------------------------------
// P14: Tenant-level RBAC result types
// ---------------------------------------------------------------------------

export type TenantRoleSuccess = {
  ok: true;
  role: TenantRole;
  tenantId: string;
};

export type TenantRoleFailure = {
  ok: false;
  response: NextResponse<ErrorResponse>;
};

export type TenantRoleResult = TenantRoleSuccess | TenantRoleFailure;

// ---------------------------------------------------------------------------
// requireTenantRole — check tenant-level RBAC for the authenticated user
// ---------------------------------------------------------------------------

/**
 * Checks that the given user has one of the allowed tenant-level roles
 * by querying the `profiles` table.
 *
 * Role hierarchy: owner > admin > editor > viewer.
 * The caller specifies the set of roles permitted for the operation.
 *
 * Returns `{ ok: true, role, tenantId }` on success.
 * Returns `{ ok: false, response }` with a 403 response on failure.
 *
 * The `supabase` client should be the user-scoped client (from `requireAuth()`)
 * so that RLS is enforced. RLS on `profiles` only lets users read their own profile.
 */
export async function requireTenantRole(
  supabase: SupabaseClient,
  userId: string,
  allowedRoles: TenantRole[],
): Promise<TenantRoleResult> {
  // 1. Query the user's profile. Try with role, fall back if column missing.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", userId)
    .single();

  // If query errored (likely role column missing — migration not applied),
  // retry without role column
  if (error && !profile) {
    const { data: basic, error: basicErr } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .single();
    if (basicErr || !basic) {
      return { ok: false, response: NextResponse.json({ error: "You do not have access to this tenant", code: "FORBIDDEN" }, { status: 403 }) };
    }
    // Role column missing (migration not applied) — default to viewer (least privilege).
    // The tenant creator should run the P14 migration so roles are properly assigned.
    console.warn(
      `[auth] Role column missing from profiles table — defaulting user ${userId} to "viewer". Run the P14 tenant RBAC migration.`,
    );
    return { ok: true, role: "viewer", tenantId: basic.tenant_id as string };
  }

  // Profile not found at all
  if (!profile) {
    return { ok: false, response: NextResponse.json({ error: "You do not have access to this tenant", code: "FORBIDDEN" }, { status: 403 }) };
  }

  // Profile found — use role, default NULL to viewer (least privilege)
  const role: TenantRole = (profile.role ?? "viewer") as TenantRole;

  // 2. Check the user's role against the allowed roles
  if (!allowedRoles.includes(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Insufficient permissions for this operation",
          code: "FORBIDDEN",
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, role, tenantId: profile.tenant_id as string };
}
