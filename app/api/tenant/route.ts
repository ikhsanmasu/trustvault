import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getUserTenantId } from "@/lib/supabase/auth";
import { parseTenant } from "@/lib/db-schemas";
import type {
  GetTenantResponse,
  UpdateTenantResponse,
  ErrorResponse,
  Tenant,
  UpdateTenantRequest,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_NAME_LENGTH = 255;

// ---------------------------------------------------------------------------
// GET /api/tenant -- Return the current user's tenant
// ---------------------------------------------------------------------------

export async function GET(): Promise<
  NextResponse<GetTenantResponse | ErrorResponse>
> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const tenantId = await getUserTenantId(supabase, user.id);
  if (!tenantId) {
    return NextResponse.json(
      { error: "User profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    return NextResponse.json(
      { error: "Tenant not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    tenant: parseTenant(tenant) as unknown as Tenant,
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/tenant -- Update the tenant name
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
): Promise<NextResponse<UpdateTenantResponse | ErrorResponse>> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const tenantId = await getUserTenantId(supabase, user.id);
  if (!tenantId) {
    return NextResponse.json(
      { error: "User profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // Parse request body
  let body: UpdateTenantRequest;
  try {
    body = (await request.json()) as UpdateTenantRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  // Validate name
  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json(
      { error: "Tenant name is required", code: "MISSING_NAME" },
      { status: 400 },
    );
  }

  const trimmedName = body.name.trim();
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      {
        error: `Tenant name must be ${MAX_NAME_LENGTH} characters or fewer`,
        code: "NAME_TOO_LONG",
      },
      { status: 400 },
    );
  }

  // Update the tenant
  const { data: tenant, error } = await supabase
    .from("tenants")
    .update({ name: trimmedName })
    .eq("id", tenantId)
    .select("*")
    .single();

  if (error || !tenant) {
    return NextResponse.json(
      { error: "Failed to update tenant", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    tenant: parseTenant(tenant) as unknown as Tenant,
  });
}
