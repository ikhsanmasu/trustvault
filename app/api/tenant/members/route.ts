import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/client";
import type {
  ListMembersResponse,
  ErrorResponse,
  TenantMember,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// ---------------------------------------------------------------------------
// GET /api/tenant/members -- List all members of the current user's tenant
// Requires: admin or owner role
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ListMembersResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. requireTenantRole (admin or owner) ---------------------------------
  const roleCheck = await requireTenantRole(supabase, user.id, [
    "owner",
    "admin",
  ]);
  if (!roleCheck.ok) return roleCheck.response;
  const { tenantId } = roleCheck;

  // -- 3. Parse query parameters --------------------------------------------
  const searchParams = request.nextUrl.searchParams;

  const search = searchParams.get("search")?.trim() || undefined;

  const limitRaw = searchParams.get("limit") ?? String(DEFAULT_LIMIT);
  const limit = parseInt(limitRaw, 10);
  if (isNaN(limit) || !Number.isInteger(limit) || limit < 1) {
    return NextResponse.json(
      { error: "limit must be a positive integer", code: "INVALID_LIMIT" },
      { status: 400 },
    );
  }
  if (limit > MAX_LIMIT) {
    return NextResponse.json(
      { error: `limit must not exceed ${MAX_LIMIT}`, code: "INVALID_LIMIT" },
      { status: 400 },
    );
  }

  const offsetRaw = searchParams.get("offset") ?? "0";
  const offset = parseInt(offsetRaw, 10);
  if (isNaN(offset) || !Number.isInteger(offset) || offset < 0) {
    return NextResponse.json(
      {
        error: "offset must be a non-negative integer",
        code: "INVALID_OFFSET",
      },
      { status: 400 },
    );
  }

  // -- 4. Query profiles for this tenant, joined with auth.users for email --
  // We use the user-scoped client. RLS on profiles only allows reading
  // one's own profile, so we need to use the service-role client or a
  // separate query approach. Since admin/owner should be able to see all
  // tenant members, we query via the tenant_id directly.
  //
  // Note: profiles RLS only allows SELECT on own row (id = auth.uid()).
  // To list all members, we use a raw query via supabase.rpc or bypass RLS
  // with the service-role client. The spec says admin/owner can see members,
  // which requires bypassing the restrictive profiles_select_own RLS.
  //
  // We'll use the profile data from the profiles table via the service-role
  // client. Since the application layer has already verified admin/owner role,
  // this is safe. The user-scoped client cannot read other users' profiles
  // due to the profiles_select_own RLS policy.
  const serviceClient = createServiceClient();

  // Fetch profiles in the tenant
  let profileQuery = serviceClient
    .from("profiles")
    .select("id, display_name, role, created_at, tenant_id")
    .eq("tenant_id", tenantId);

  if (search) {
    // Filter by display_name (ILIKE) or email (requires join — we'll do it post-query
    // for simplicity, since tenant member lists are typically small)
    profileQuery = profileQuery.ilike("display_name", `%${search}%`);
  }

  const { data: profiles, error: profileError } = await profileQuery
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (profileError || !profiles) {
    return NextResponse.json(
      { error: "Failed to fetch members", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // -- 5. Resolve emails from auth.users (single query reused for search) ---
  let filteredProfiles = profiles as Array<{
    id: string; display_name: string | null; role: string;
    created_at: string; tenant_id: string;
  }>;

  const { data: authUsersData } = await serviceClient.auth.admin.listUsers();
  const emailMap = new Map<string, string>();
  if (authUsersData?.users) {
    for (const u of authUsersData.users) emailMap.set(u.id, u.email ?? "");
  }

  if (search) {
    const matchingUserIds = new Set<string>();
    for (const [id, email] of emailMap) {
      if (email.toLowerCase().includes(search.toLowerCase())) matchingUserIds.add(id);
    }
    if (matchingUserIds.size > 0) {
      const alreadyIncluded = new Set(filteredProfiles.map((p) => p.id));
      const missingIds = [...matchingUserIds].filter((id) => !alreadyIncluded.has(id));
      if (missingIds.length > 0) {
        const { data: extraProfiles } = await serviceClient
          .from("profiles").select("id, display_name, role, created_at, tenant_id")
          .eq("tenant_id", tenantId).in("id", missingIds);
        if (extraProfiles) filteredProfiles = [...filteredProfiles, ...(extraProfiles as typeof filteredProfiles)];
      }
    }
  }

  // -- 6. Build response ----------------------------------------------------
  const members: TenantMember[] = filteredProfiles.map((p) => ({
    id: p.id,
    email: emailMap.get(p.id) ?? "",
    display_name: p.display_name,
    role: p.role as TenantMember["role"],
    created_at: p.created_at,
  }));

  return NextResponse.json({
    members,
    total: members.length,
  });
}
