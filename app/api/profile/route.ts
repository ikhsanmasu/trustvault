import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import type { GetProfileResponse, ErrorResponse, Profile } from "@/lib/types";

// ---------------------------------------------------------------------------
// GET /api/profile — Return the authenticated user's profile
// ---------------------------------------------------------------------------

export async function GET(): Promise<
  NextResponse<GetProfileResponse | ErrorResponse>
> {
  // ── 1. requireAuth ─────────────────────────────────────────────────────
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // ── 2. Query profiles where id = user.id (RLS allows own profile only) ─
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json(
      { error: "Profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    profile: profile as unknown as Profile,
  });
}
