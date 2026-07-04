import { NextResponse } from "next/server";
import { requireAuth, getUserTenantId } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/client";
import { parseDocument } from "@/lib/db-schemas";
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
  const tenantId = await getUserTenantId(supabase, user.id);
  if (!tenantId) {
    return NextResponse.json(
      { error: "User profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -------------------------------------------------------------------------
  // P7: Run ALL simple queries in parallel (first batch)
  // -------------------------------------------------------------------------

  const [
    docCountResult,
    sizeResult,
    recentResult,
    userCountResult,
    anchoredCountResult,
    docsByTypeResult,
    docsByMonthResult,
  ] = await Promise.allSettled([
    // 1. Document count
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),

    // 2. Total storage (fetch all file_size_bytes)
    supabase
      .from("documents")
      .select("file_size_bytes")
      .eq("tenant_id", tenantId),

    // 4. Recent documents (5 most recent)
    supabase
      .from("documents")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(5),

    // 5. P7: total_users
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),

    // 6. P7: anchored_count
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .not("fingerprint", "is", null),

    // 7. P7: documents_by_type (raw rows for grouping)
    supabase
      .from("documents")
      .select("file_type")
      .eq("tenant_id", tenantId),

    // 8. P7: documents_by_month (raw rows for grouping, last 12 months)
    supabase
      .from("documents")
      .select("created_at")
      .eq("tenant_id", tenantId),
  ]);

  // -------------------------------------------------------------------------
  // Second batch: tenant-scoped counts (P11: no more project-scoped queries)
  // -------------------------------------------------------------------------
  const serviceClient = createServiceClient();

  // Count active shares by joining through projects in the tenant,
  // and also include shares with null project_id whose documents belong to tenant.
  const { data: tenantProjects } = await serviceClient
    .from("projects")
    .select("id")
    .eq("tenant_id", tenantId);
  const projectIds = (tenantProjects ?? []).map(
    (p: { id: string }) => p.id,
  );

  let activeShares = 0;
  let totalChunks = 0;

  // active_shares: count shares in tenant's projects + shares with null project_id
  {
    let sharesQuery = serviceClient
      .from("shared_links")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    if (projectIds.length > 0) {
      sharesQuery = sharesQuery.or(
        `project_id.in.(${projectIds.join(",")}),project_id.is.null`,
      );
    } else {
      sharesQuery = sharesQuery.is("project_id", null);
    }

    const { count: sharesCount, error: sharesErr } = await sharesQuery;
    if (!sharesErr) activeShares = sharesCount ?? 0;
  }

  // total_chunks: RLS enforces tenant scoping via documents join (P11)
  {
    const { count: chunksCount, error: chunksErr } = await serviceClient
      .from("document_chunks")
      .select("id", { count: "exact", head: true });
    if (!chunksErr) totalChunks = chunksCount ?? 0;
  }

  // -------------------------------------------------------------------------
  // Helper: unwrap count from settled result
  // -------------------------------------------------------------------------
  function unwrapCount(
    result: PromiseSettledResult<{ count: number | null; error: unknown }>,
    fallback: number = 0,
  ): number {
    if (result.status === "rejected") return fallback;
    const { count, error } = result.value;
    if (error) return fallback;
    return count ?? fallback;
  }

  // -------------------------------------------------------------------------
  // Extract results
  // -------------------------------------------------------------------------

  const docCount = unwrapCount(docCountResult);

  // Total storage
  let totalStorageBytes = 0;
  if (
    sizeResult.status === "fulfilled" &&
    !sizeResult.value.error &&
    sizeResult.value.data
  ) {
    totalStorageBytes = (
      sizeResult.value.data as { file_size_bytes: number }[]
    ).reduce((sum, row) => sum + (row.file_size_bytes ?? 0), 0);
  }

  // Recent documents
  let recentDocs: Document[] = [];
  if (
    recentResult.status === "fulfilled" &&
    !recentResult.value.error &&
    recentResult.value.data
  ) {
    recentDocs = (recentResult.value.data as unknown[]).map(d => parseDocument(d)) as unknown as Document[];
  }

  // P7 fields
  const totalUsers = unwrapCount(userCountResult);
  const anchoredCount = unwrapCount(anchoredCountResult);

  // documents_by_type
  const typeMap = new Map<string, number>();
  if (
    docsByTypeResult.status === "fulfilled" &&
    !docsByTypeResult.value.error &&
    docsByTypeResult.value.data
  ) {
    for (const row of docsByTypeResult.value.data as {
      file_type: string;
    }[]) {
      const t = row.file_type || "unknown";
      typeMap.set(t, (typeMap.get(t) ?? 0) + 1);
    }
  }
  const documentsByType = Array.from(typeMap.entries()).map(
    ([type, count]) => ({ type, count }),
  );

  // documents_by_month (last 12 months)
  const monthMap = new Map<string, number>();
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, 0);
  }
  if (
    docsByMonthResult.status === "fulfilled" &&
    !docsByMonthResult.value.error &&
    docsByMonthResult.value.data
  ) {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    for (const row of docsByMonthResult.value.data as {
      created_at: string;
    }[]) {
      const d = new Date(row.created_at);
      if (d >= cutoff) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
      }
    }
  }
  const documentsByMonth = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return NextResponse.json({
    stats: {
      document_count: docCount,
      total_storage_bytes: totalStorageBytes,
      recent_documents: recentDocs,
      total_users: totalUsers,
      anchored_count: anchoredCount,
      active_shares: activeShares,
      documents_by_type: documentsByType,
      documents_by_month: documentsByMonth,
      total_chunks: totalChunks,
    },
  });
}
