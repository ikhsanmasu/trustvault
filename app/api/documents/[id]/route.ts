import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import type {
  GetDocumentResponse,
  ErrorResponse,
  Document,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validates that a string is a properly formatted UUID (v4/hex). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// GET /api/documents/:id (P2: auth required, RLS enforces access)
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<GetDocumentResponse | ErrorResponse>> {
  // ── 1. requireAuth ─────────────────────────────────────────────────────
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { id } = await params;

  // ── 2. Validate UUID format ────────────────────────────────────────────
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid document ID format", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  // ── 3. Fetch from database (user-scoped client, RLS-enforced) ──────────
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: `Document not found: ${id}`, code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    document: data as unknown as Document,
  });
}
