// ---------------------------------------------------------------------------
// GET /api/admin/dashboard — Platform-wide admin overview
// Access: ADMIN_MONITORING_SECRET or authenticated owner
// ---------------------------------------------------------------------------
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";
import { getMetrics } from "@/lib/monitoring";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = request.nextUrl.searchParams.get("secret");
  const adminSecret = process.env.ADMIN_MONITORING_SECRET;

  // Admin secret bypass
  if (!adminSecret || secret !== adminSecret) {
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json({ error: "Unauthorized", code: "FORBIDDEN" }, { status: 403 });
    }
  }

  const serviceClient = createServiceClient();

  // Fetch aggregate data
  const { count: tenantCount } = await serviceClient
    .from("tenants").select("*", { count: "exact", head: true });

  const { count: userCount } = await serviceClient
    .from("profiles").select("*", { count: "exact", head: true });

  const { count: docCount } = await serviceClient
    .from("documents").select("*", { count: "exact", head: true }).is("deleted_at", null);

  const { count: anchoredCount } = await serviceClient
    .from("documents").select("*", { count: "exact", head: true }).not("fingerprint", "is", null);

  const { count: shareCount } = await serviceClient
    .from("shared_links").select("*", { count: "exact", head: true }).eq("is_active", true);

  const { count: totalChunks } = await serviceClient
    .from("document_chunks").select("*", { count: "exact", head: true });

  // Recent tenants
  const { data: recentTenants } = await serviceClient
    .from("tenants")
    .select("id, name, plan, usage_documents, usage_llm_calls, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  // System health
  const health = getMetrics();

  return NextResponse.json({
    counts: {
      tenants: tenantCount ?? 0,
      users: userCount ?? 0,
      documents: docCount ?? 0,
      anchoredDocuments: anchoredCount ?? 0,
      activeShares: shareCount ?? 0,
      totalChunks: totalChunks ?? 0,
    },
    tenants: (recentTenants ?? []).map(t => ({
      id: t.id,
      name: t.name,
      plan: t.plan,
      usageDocs: t.usage_documents,
      usageLlmCalls: t.usage_llm_calls,
      createdAt: t.created_at,
    })),
    health,
  });
}
