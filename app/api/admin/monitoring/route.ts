import { NextRequest, NextResponse } from "next/server";
import { getMetrics } from "@/lib/monitoring";
import { requireAuth } from "@/lib/supabase/auth";
import { requireTenantRole } from "@/lib/supabase/auth";

/**
 * GET /api/admin/monitoring — internal monitoring dashboard data.
 *
 * Access methods (in priority order):
 *   1. Admin secret:   ?secret=<ADMIN_MONITORING_SECRET>   — platform operator bypass
 *   2. Tenant owner:   authenticated + owner role           — self-service for tenant owners
 *
 * In development, if ADMIN_MONITORING_SECRET is not set, auth is optional.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = request.nextUrl.searchParams.get("secret");
  const adminSecret = process.env.ADMIN_MONITORING_SECRET;

  // ── Method 1: Admin secret bypass ──────────────────────────────────────
  if (adminSecret && secret === adminSecret) {
    const metrics = getMetrics();
    return NextResponse.json(metrics);
  }

  // In dev, if no secret is configured, allow access without auth
  if (!adminSecret && process.env.NODE_ENV !== "production") {
    const metrics = getMetrics();
    return NextResponse.json(metrics);
  }

  // ── Method 2: Authenticated tenant owner ───────────────────────────────
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { supabase, user } = auth;

  const roleCheck = await requireTenantRole(supabase, user.id, ["owner"]);
  if (!roleCheck.ok) {
    return NextResponse.json(
      { error: "Only tenant owners can access monitoring. Or provide ?secret= with ADMIN_MONITORING_SECRET.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const metrics = getMetrics();
  return NextResponse.json(metrics);
}
