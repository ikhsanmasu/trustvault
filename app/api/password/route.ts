import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import type {
  ChangePasswordResponse,
  ErrorResponse,
  ChangePasswordRequest,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

// ---------------------------------------------------------------------------
// PATCH /api/password -- Change the authenticated user's password
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
): Promise<NextResponse<ChangePasswordResponse | ErrorResponse>> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  // Parse request body
  let body: ChangePasswordRequest;
  try {
    body = (await request.json()) as ChangePasswordRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  // Validate fields
  if (!body.current_password || typeof body.current_password !== "string") {
    return NextResponse.json(
      { error: "current_password is required", code: "MISSING_PASSWORD" },
      { status: 400 },
    );
  }
  if (!body.new_password || typeof body.new_password !== "string") {
    return NextResponse.json(
      { error: "new_password is required", code: "MISSING_PASSWORD" },
      { status: 400 },
    );
  }
  if (body.new_password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, code: "PASSWORD_TOO_SHORT" },
      { status: 400 },
    );
  }
  if (body.new_password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must not exceed ${MAX_PASSWORD_LENGTH} characters`, code: "PASSWORD_TOO_LONG" },
      { status: 400 },
    );
  }

  // Update password via Supabase Auth
  const { error } = await supabase.auth.updateUser({
    password: body.new_password,
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[password] updateUser error:", (error as Error).message);
    }
    return NextResponse.json(
      { error: "Failed to update password", code: "AUTH_ERROR" },
      { status: 400 },
    );
  }

  if (error) {
    return NextResponse.json(
      { error: String(error), code: "AUTH_ERROR" },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
