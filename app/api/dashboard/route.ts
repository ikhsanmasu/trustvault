import { NextResponse } from "next/server";
import { requireAuth, getUserTenantId } from "@/lib/supabase/auth";
import type {
  DashboardResponse,
  ErrorResponse,
  Document,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// GET /api/dashboard -- Return aggregate stats for the authenticated user
// ---------------------------------------------------------------------------

export async function GET(): Promise<
  NextResponse<DashboardResponse | ErrorResponse>
> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // Get the user's tenant
  const tenantId = await getUserTenantId(supabase);
  if (!tenantId) {
    return NextResponse.json(
      { error: "User profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // Gather dashboard stats in parallel where possible
  // 1. Project count — how many projects the user belongs to
  const { count: projectCount, error: projError } = await supabase
    .from("project_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (projError) {
    return NextResponse.json(
      { error: "Failed to fetch project count", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // 2. Document count — total documents in the user's tenant
  const { count: docCount, error: docError } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (docError) {
    return NextResponse.json(
      { error: "Failed to fetch document count", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // 3. Total storage used — sum of file_size_bytes across the tenant
  const { data: sizeData, error: sizeError } = await supabase
    .from("documents")
    .select("file_size_bytes")
    .eq("tenant_id", tenantId);

  let totalStorageBytes = 0;
  if (!sizeError && sizeData) {
    totalStorageBytes = (sizeData as { file_size_bytes: number }[]).reduce(
      (sum, row) => sum + (row.file_size_bytes ?? 0),
      0,
    );
  }

  // 4. Recent documents — 5 most recent across the tenant
  const { data: recentDocs, error: recentError } = await supabase
    .from("documents")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (recentError) {
    return NextResponse.json(
      { error: "Failed to fetch recent documents", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    stats: {
      project_count: projectCount ?? 0,
      document_count: docCount ?? 0,
      total_storage_bytes: totalStorageBytes,
      recent_documents: (recentDocs ?? []) as unknown as Document[],
    },
  });
}
