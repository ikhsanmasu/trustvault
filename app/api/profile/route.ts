import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import type {
  GetProfileResponse,
  UpdateProfileResponse,
  ErrorResponse,
  Profile,
  UpdateProfileRequest,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// GET /api/profile -- Return the authenticated user's profile
// ---------------------------------------------------------------------------

export async function GET(): Promise<
  NextResponse<GetProfileResponse | ErrorResponse>
> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

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

// ---------------------------------------------------------------------------
// PATCH /api/profile -- Update the authenticated user's display_name
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
): Promise<NextResponse<UpdateProfileResponse | ErrorResponse>> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // Parse request body
  let body: UpdateProfileRequest;
  try {
    body = (await request.json()) as UpdateProfileRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  // Validate: display_name is optional in body, but if provided must be a
  // string (null is allowed to clear it, empty string is trimmed to null)
  let displayName: string | null = null;
  if (body.display_name !== undefined) {
    if (body.display_name === null) {
      displayName = null;
    } else if (typeof body.display_name === "string") {
      const trimmed = body.display_name.trim();
      displayName = trimmed.length > 0 ? trimmed : null;
    } else {
      return NextResponse.json(
        { error: "display_name must be a string or null", code: "INVALID_DISPLAY_NAME" },
        { status: 400 },
      );
    }
  } else {
    return NextResponse.json(
      { error: "display_name field is required (pass null to clear)", code: "MISSING_DISPLAY_NAME" },
      { status: 400 },
    );
  }

  // Update the profile
  const { data: profile, error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", user.id)
    .select("*")
    .single();

  if (error || !profile) {
    return NextResponse.json(
      { error: "Failed to update profile", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    profile: profile as unknown as Profile,
  });
}
