import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";
import { resetMonthlyUsage } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// GET /api/cron/reset-usage — Vercel Cron: monthly usage counter reset
// ---------------------------------------------------------------------------
// Scheduled in vercel.json (daily). resetMonthlyUsage() only touches tenants
// whose usage_reset_at has passed, so running it daily is idempotent — each
// tenant is reset exactly once per billing month.
//
// Vercel sends `Authorization: Bearer ${CRON_SECRET}` on cron invocations.
// Without a valid secret the endpoint refuses, so it cannot be triggered by
// the public to skew usage accounting.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron:reset-usage] CRON_SECRET is not set — refusing");
    return NextResponse.json(
      { error: "Cron not configured", code: "CONFIG_ERROR" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const resetCount = await resetMonthlyUsage(createServiceClient());
  return NextResponse.json({ ok: true, tenantsReset: resetCount });
}
