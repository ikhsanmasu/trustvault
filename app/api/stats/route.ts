import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";

/**
 * GET /api/stats — Public aggregate stats for TrustVault landing page.
 * Uses service-role client (no auth required, read-only counts).
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    // Run all counts in parallel
    const [usersRes, docsRes, anchoredRes, sharesRes, projectsRes] =
      await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null),
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .not("fingerprint", "is", null),
        supabase
          .from("shared_links")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
        supabase.from("projects").select("id", { count: "exact", head: true }),
      ]);

    return NextResponse.json(
      {
        users: usersRes.count ?? 0,
        documents: docsRes.count ?? 0,
        anchored: anchoredRes.count ?? 0,
        active_shares: sharesRes.count ?? 0,
        projects: projectsRes.count ?? 0,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { users: 0, documents: 0, anchored: 0, active_shares: 0, projects: 0 },
      { status: 200 },
    );
  }
}
