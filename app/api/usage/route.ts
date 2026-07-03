// ---------------------------------------------------------------------------
// TrustVault P17 — GET /api/usage
// Returns usage statistics for the authenticated user's tenant.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { requireAuth, getUserTenantId } from "@/lib/supabase/auth";
import { PLAN_LIMITS, type PlanType } from "@/lib/rate-limit";
import type { ErrorResponse, GetUsageResponse } from "@/lib/types";

export async function GET(): Promise<
  NextResponse<GetUsageResponse | ErrorResponse>
> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Get user's tenant_id ----------------------------------------------
  const tenantId = await getUserTenantId(supabase, user.id);
  if (!tenantId) {
    return NextResponse.json(
      { error: "User profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 3. Fetch tenant usage data -------------------------------------------
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("plan, usage_documents, usage_llm_calls, usage_storage_bytes, usage_reset_at")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    return NextResponse.json(
      { error: "Tenant not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const plan = (tenant.plan as PlanType) ?? "free";
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  return NextResponse.json({
    usage: {
      plan,
      documents_used: Number(tenant.usage_documents ?? 0),
      documents_limit: isFinite(limits.maxDocs) ? limits.maxDocs : null,
      llm_calls_used: Number(tenant.usage_llm_calls ?? 0),
      llm_calls_limit: isFinite(limits.maxLlmCalls) ? limits.maxLlmCalls : null,
      storage_bytes_used: Number(tenant.usage_storage_bytes ?? 0),
      storage_bytes_limit: null, // No per-plan storage cap in P17
      usage_reset_at: tenant.usage_reset_at ?? null,
    },
  });
}
