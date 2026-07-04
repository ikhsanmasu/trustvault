import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getUserTenantId } from "@/lib/supabase/auth";

// GET /api/documents/check-name?name=xxx
// Checks if a document name already exists in the caller's tenant.
// Excludes soft-deleted documents.
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const tenantId = await getUserTenantId(supabase, auth.user.id);
  if (!tenantId) {
    return NextResponse.json(
      { error: "User profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ exists: false, count: 0 });
  }

  const { count, error } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("name", name)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json(
      { error: "Database error", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ exists: (count ?? 0) > 0, count: count ?? 0 });
}
