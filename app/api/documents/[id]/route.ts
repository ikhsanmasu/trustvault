import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import type {
  GetDocumentResponse,
  ErrorResponse,
  Document,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Loosely validates that a string looks like a UUID. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// GET /api/documents/:id
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<GetDocumentResponse | ErrorResponse>> {
  const { id } = await params;

  // ── Validate UUID format ──────────────────────────────────────────────
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid document ID format", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  // ── Fetch from database ───────────────────────────────────────────────
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
