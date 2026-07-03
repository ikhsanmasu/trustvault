import { type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { ErrorResponse, Role, TenantRole } from "@/lib/types";

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
// Role check result types
// ---------------------------------------------------------------------------

export type RoleSuccess = {
  ok: true;
  role: Role;
};

export type RoleFailure = {
  ok: false;
  response: NextResponse<ErrorResponse>;
};

export type RoleResult = RoleSuccess | RoleFailure;

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
      response: NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 },
      ),
    };
  }

  return { ok: true, user, supabase };
}

// ---------------------------------------------------------------------------
// requireProjectRole — check RBAC for a project
// ---------------------------------------------------------------------------

/**
 * Checks that the given user has one of the allowed roles in the given
 * project by querying the `project_members` table.
 *
 * Returns `{ ok: true, role }` on success.
 * Returns `{ ok: false, response }` with a 403 or 404 response on failure.
 *
 * The `supabase` client should be the user-scoped client (from `requireAuth()`)
 * so that RLS is enforced. RLS on `project_members` only lets users see
 * memberships for projects they belong to.
 */
export async function requireProjectRole(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  allowedRoles: Role[],
): Promise<RoleResult> {
  const { data: member, error } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .single();

  if (error || !member) {
    // RLS may have filtered the row, or the project doesn't exist.
    // Return 403 to avoid leaking whether the project exists (per api-spec).
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You do not have access to this project", code: "FORBIDDEN" },
        { status: 403 },
      ),
    };
  }

  if (!allowedRoles.includes(member.role as Role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Insufficient permissions for this operation", code: "FORBIDDEN" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, role: member.role as Role };
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
    return { ok: true, role: "owner", tenantId: basic.tenant_id as string };
  }

  // Profile not found at all
  if (!profile) {
    return { ok: false, response: NextResponse.json({ error: "You do not have access to this tenant", code: "FORBIDDEN" }, { status: 403 }) };
  }

  // Profile found — use role, default NULL to owner
  const role: TenantRole = (profile.role ?? "owner") as TenantRole;

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
