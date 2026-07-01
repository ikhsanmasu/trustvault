import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";
import type {
  ListDocumentsResponse,
  ErrorResponse,
  Document,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidToken(token: string): boolean {
  return /^[0-9a-f]{32}$/i.test(token);
}

async function getShareByToken(
  token: string,
): Promise<{ document_ids: string[]; is_active: boolean; expires_at: string | null } | null> {
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("shared_links")
    .select("document_ids, is_active, expires_at")
    .eq("token", token)
    .single();

  if (error || !data) return null;
  return data as unknown as {
    document_ids: string[];
    is_active: boolean;
    expires_at: string | null;
  };
}

// ---------------------------------------------------------------------------
// GET /api/share/[token]/documents -- PUBLIC — list shared documents
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse<ListDocumentsResponse | ErrorResponse>> {
  const { token } = await params;

  if (!isValidToken(token)) {
    return NextResponse.json(
      { error: "Invalid share token format", code: "INVALID_TOKEN" },
      { status: 400 },
    );
  }

  // Validate share
  const share = await getShareByToken(token);
  if (!share) {
    return NextResponse.json(
      { error: "Share link not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  if (!share.is_active) {
    return NextResponse.json(
      { error: "This share link has been revoked", code: "GONE" },
      { status: 410 },
    );
  }

  if (share.expires_at) {
    const expiresAt = new Date(share.expires_at);
    if (expiresAt <= new Date()) {
      return NextResponse.json(
        { error: "This share link has expired", code: "GONE" },
        { status: 410 },
      );
    }
  }

  // Fetch documents
  if (share.document_ids.length === 0) {
    return NextResponse.json({ documents: [], total: 0 });
  }

  const serviceClient = createServiceClient();
  const { data, error, count } = await serviceClient
    .from("documents")
    .select("*", { count: "exact" })
    .in("id", share.document_ids)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch documents", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    documents: (data ?? []) as unknown as Document[],
    total: count ?? 0,
  });
}
